"use client";

import type { Filter, Log, Provider } from "ethers";

/**
 * eth_getLogs 分块扫描工具。
 *
 * 绝大多数 RPC 节点（PublicNode / Alchemy / Infura / Geth / Anvil / Hardhat EDR）
 * 对单次 eth_getLogs 的区块范围有硬性上限（常见 10,000 块），超限直接报错：
 *   range 11396668 exceeds limit of 10000
 *
 * 本工具把 [fromBlock, toBlock] 切成小窗口并发请求，遇到“范围超限”错误时
 * 自动对半缩小窗口重试，从而突破上限；对瞬时错误做指数退避重试。
 */

export type LogsFilter = Omit<Filter, "fromBlock" | "toBlock" | "blockHash">;

export interface ChunkedGetLogsOptions {
  /** 初始窗口大小（块数），默认 9000（留 10% 余量，避免恰好卡在 10000 上限） */
  chunkSize?: number;
  /** 最小窗口大小，二分缩到此仍超限则视为 RPC 不支持并抛错（默认 200） */
  minChunkSize?: number;
  /** 并发请求数（默认 4，避免触发 RPC 限流） */
  concurrency?: number;
  /** 瞬时错误（限流/网络抖动）重试次数（默认 2） */
  retries?: number;
  /** 进度回调：已完成窗口数 / 总窗口数（仅分块模式触发） */
  onProgress?: (done: number, total: number) => void;
}

interface WindowTask {
  from: number;
  to: number;
}

/** 判断错误是否为 eth_getLogs 区块范围/结果量超限 */
function isRangeLimitError(e: unknown): boolean {
  const msg = (e as Error)?.message ?? String(e);
  return /exceeds limit|block range too large|query returned more than \d+ results|range (of )?\d+ (is too large|exceeds)/i.test(
    msg,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 带退避的瞬时错误重试（范围超限错误不重试，交给上层二分） */
async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (isRangeLimitError(e)) throw e;
      if (i < retries) await sleep(300 * (i + 1));
    }
  }
  throw lastErr;
}

/**
 * 请求单个窗口 [from, to]；若范围超限则对半拆成两个子窗口递归请求，
 * 直到窗口 ≤ minChunkSize。返回结果按区块顺序排列。
 */
async function fetchWindow(
  provider: Provider,
  filter: LogsFilter,
  from: number,
  to: number,
  minChunkSize: number,
  retries: number,
): Promise<Log[]> {
  if (to < from) return [];
  try {
    return await withRetry(
      () => provider.getLogs({ ...filter, fromBlock: from, toBlock: to }),
      retries,
    );
  } catch (e) {
    if (!isRangeLimitError(e)) throw e;
    const size = to - from + 1;
    if (size <= minChunkSize) throw e;
    const mid = from + Math.floor(size / 2) - 1;
    // 顺序请求（不并发），避免并发翻倍把 RPC 压垮
    const left = await fetchWindow(provider, filter, from, mid, minChunkSize, retries);
    const right = await fetchWindow(provider, filter, mid + 1, to, minChunkSize, retries);
    return [...left, ...right];
  }
}

/**
 * 分块扫描 getLogs：先尝试一次拿全（快路径，部分 RPC 允许大范围），
 * 失败后按 [fromBlock, toBlock] 切片并发扫描。结果按区块号、日志索引排序。
 */
export async function chunkedGetLogs(
  provider: Provider,
  filter: LogsFilter,
  fromBlock: number | bigint,
  toBlock: number | bigint | "latest",
  options: ChunkedGetLogsOptions = {},
): Promise<Log[]> {
  const start = Number(fromBlock);
  const end = toBlock === "latest" ? await provider.getBlockNumber() : Number(toBlock);
  if (end < start) return [];

  const { chunkSize = 9000, minChunkSize = 200, concurrency = 4, retries = 2, onProgress } = options;

  // 快路径：单次请求覆盖全范围（本地节点 / 大额度 RPC 直接成功，省去分块开销）
  try {
    return await provider.getLogs({ ...filter, fromBlock: start, toBlock: end });
  } catch (e) {
    if (!isRangeLimitError(e)) throw e;
  }

  // 慢路径：切成小窗口并发扫描
  const queue: WindowTask[] = [];
  for (let f = start; f <= end; f += chunkSize) {
    queue.push({ from: f, to: Math.min(f + chunkSize - 1, end) });
  }
  const total = queue.length;
  const logs: Log[] = [];
  let nextIdx = 0;
  let doneCount = 0;
  let firstError: unknown = null;

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, total)) }, async () => {
    while (firstError === null) {
      const idx = nextIdx++;
      if (idx >= queue.length) return;
      const task = queue[idx];
      try {
        const part = await fetchWindow(provider, filter, task.from, task.to, minChunkSize, retries);
        logs.push(...part);
      } catch (e) {
        if (firstError === null) firstError = e;
        return;
      } finally {
        doneCount++;
        onProgress?.(doneCount, total);
      }
    }
  });
  await Promise.all(workers);
  if (firstError !== null) throw firstError;

  // 各 worker 完成顺序不定，按区块号 + 日志索引还原顺序
  logs.sort((a, b) => Number(a.blockNumber) - Number(b.blockNumber) || a.index - b.index);
  return logs;
}
