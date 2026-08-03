"use client";

import { useEffect, useState } from "react";
import { useWeb3 } from "./Web3Provider";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuctionContract } from "@/hooks/useAuctionContract";
import { useAuxContracts } from "@/hooks/useAuxContracts";
import { useAlert } from "./AlertProvider";
import { formatUsd, shortAddress } from "@/lib/format";
import { CHAINLINK_SEPOLIA_FEEDS, ZERO_ADDRESS } from "@/lib/constants";

interface SetOracleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 设置 token → oracle 映射 */
export default function SetOracleModal({ open, onClose, onSuccess }: SetOracleModalProps) {
  const { getSignerContract, getReadContract } = useAuctionContract();
  const { setTokenOracle, sending } = useAdmin(open ? getSignerContract() : null);
  const { getOracleAddress, getUsdcAddress } = useAuxContracts();
  const { showInfo } = useAlert();

  const [token, setToken] = useState("eth"); // eth | usdc | custom
  const [customToken, setCustomToken] = useState("");
  const [oracle, setOracle] = useState("");
  const [current, setCurrent] = useState<{ eth: string; usdc: string } | null>(null);

  // 打开时查询链上 tokenToOracle 现状
  useEffect(() => {
    if (!open) return;
    setOracle(getOracleAddress());
    setCustomToken("");
    const contract = getReadContract();
    if (!contract) {
      setCurrent({ eth: "", usdc: "" });
      return;
    }
    const usdc = getUsdcAddress();
    Promise.all([
      contract.tokenToOracle(ZERO_ADDRESS).catch(() => ZERO_ADDRESS),
      usdc ? contract.tokenToOracle(usdc).catch(() => ZERO_ADDRESS) : Promise.resolve(ZERO_ADDRESS),
    ]).then(([ethOracle, usdcOracle]) => {
      setCurrent({
        eth: ethOracle === ZERO_ADDRESS ? "" : ethOracle,
        usdc: usdcOracle === ZERO_ADDRESS ? "" : usdcOracle,
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const resolveToken = () => {
    if (token === "eth") return ZERO_ADDRESS;
    if (token === "usdc") return getUsdcAddress() || "";
    return customToken;
  };

  const handleSubmit = async () => {
    const t = resolveToken();
    if (!t || !oracle) {
      showInfo("请填写 token 与 oracle 地址");
      return;
    }
    const result = await setTokenOracle(t, oracle);
    if (result) {
      onSuccess();
      onClose();
    }
  };

  /** 一键使用 Chainlink Sepolia 真实价格喂价 */
  const applyChainlink = async (tokenKey: "ETH/USD" | "USDC/USD") => {
    const feed = CHAINLINK_SEPOLIA_FEEDS[tokenKey];
    const t = tokenKey === "ETH/USD" ? ZERO_ADDRESS : getUsdcAddress();
    if (!t) {
      showInfo(tokenKey === "USDC/USD" ? "请先在 /setup 部署 USDC 合约" : "缺少 token 地址");
      return;
    }
    // 同步展示给用户 + 写入输入框
    setToken(tokenKey === "ETH/USD" ? "eth" : "usdc");
    setOracle(feed);
    const result = await setTokenOracle(t, feed);
    if (result) {
      onSuccess();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-800">设置价格源（Oracle）</h2>

        <div className="mt-4 space-y-3">
          {/* 快速：Chainlink 真实价格（Sepolia） */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
            <p className="text-xs font-medium text-sky-700">
              ⚡ 快速：Chainlink 真实价格（Sepolia 测试网）
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              直接使用 Chainlink 官方 AggregatorV3Interface 喂价，无需部署 MockOracle。
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => applyChainlink("ETH/USD")}
                disabled={sending}
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500 disabled:opacity-50"
              >
                用 ETH/USD 喂价
              </button>
              <button
                onClick={() => applyChainlink("USDC/USD")}
                disabled={sending}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                用 USDC/USD 喂价
              </button>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-700">
                查看源地址
              </summary>
              <div className="mt-1 space-y-0.5 font-mono text-[10px] text-slate-500">
                <p>ETH/USD: {shortAddress(CHAINLINK_SEPOLIA_FEEDS["ETH/USD"])}</p>
                <p>USDC/USD: {shortAddress(CHAINLINK_SEPOLIA_FEEDS["USDC/USD"])}</p>
              </div>
            </details>
          </div>

          <div>
            <label className="text-xs text-slate-500">Token</label>
            <select
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
            >
              <option value="eth">ETH（0x000…0）</option>
              <option value="usdc">USDC</option>
              <option value="custom">自定义地址</option>
            </select>
          </div>

          {token === "custom" && (
            <div>
              <label className="text-xs text-slate-500">自定义 Token 地址</label>
              <input
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                placeholder="0x…"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-slate-500">Oracle 合约地址</label>
            <input
              value={oracle}
              onChange={(e) => setOracle(e.target.value)}
              placeholder="0x…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            <p>当前映射（读取链上 tokenToOracle）：</p>
            <p className="mt-1 font-mono">
              ETH → {current?.eth ? shortAddress(current.eth) : "—"}
            </p>
            <p className="mt-0.5 font-mono">
              USDC → {current?.usdc ? shortAddress(current.usdc) : "—"}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={sending}
            className="flex-1 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {sending ? "配置中…" : "保存配置"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200/70"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
