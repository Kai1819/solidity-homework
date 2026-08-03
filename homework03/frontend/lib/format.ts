"use client";

import { formatUnits } from "ethers";
import { USD_DECIMALS, USDC_DECIMALS, ZERO_ADDRESS } from "./constants";
import type { Auction, AuctionStatus, AuctionView } from "@/types";

/** 8 位小数美元 → "$1,234.56"（补零到 2 位小数） */
export function formatUsd(value: bigint | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const s = formatUnits(value, USD_DECIMALS);
  const [int, dec] = s.split(".");
  const intFmt = Number(int).toLocaleString("en-US");
  const decFmt = (dec || "").slice(0, 2).padEnd(2, "0");
  return `$${intFmt}.${decFmt}`;
}

/** 代币数量（按精度）→ 人类可读，ETH 4 位 / ERC20 2 位（补零） */
export function formatTokenAmount(value: bigint, decimals: number): string {
  const s = formatUnits(value, decimals);
  const [int, dec] = s.split(".");
  const intFmt = Number(int).toLocaleString("en-US");
  const keep = decimals === 18 ? 4 : 2;
  const decFmt = (dec || "").slice(0, keep).padEnd(keep, "0");
  return `${intFmt}.${decFmt}`;
}

/** 拍卖状态机 */
export function getAuctionStatus(auction: Auction): AuctionStatus {
  const started = auction.startingTime > 0n;
  const ended =
    started && auction.startingTime + auction.duration <= BigInt(Math.floor(Date.now() / 1000));
  if (ended) {
    return auction.highestBidder.toLowerCase() !== ZERO_ADDRESS ? "ended-with-bid" : "ended-no-bid";
  }
  return started ? "active" : "not-started";
}

/** 拍卖 → 展示视图（含派生字段）
 *  关键：必须显式 named 重建 plain object，不能用 `{...auction}` 展开。
 *  ethers v6 Result 的 named props 通过属性访问可用，但 spread 只展开数组索引 0..10，
 *  丢 named keys（nft/nftId/seller/...）→ 下游 a.nftId/.seller 等访问全为 undefined。
 */
export function toAuctionView(
  id: bigint,
  auction: Auction,
  now: bigint = BigInt(Math.floor(Date.now() / 1000)),
): AuctionView {
  const ended =
    auction.startingTime > 0n && now >= auction.startingTime + auction.duration;
  const status: AuctionStatus = ended
    ? auction.highestBidder.toLowerCase() !== ZERO_ADDRESS
      ? "ended-with-bid"
      : "ended-no-bid"
    : auction.startingTime > 0n
      ? "active"
      : "not-started";
  return {
    nft: auction.nft,
    nftId: auction.nftId,
    seller: auction.seller,
    // 字段顺序与 homework03 MetaNFTAuctionBase.Auction struct 一致：
    // highestBidder (3) 在 startingTime (4) 之前；duration/paymentToken
    // (5/6) 在 startingPriceInDollar (7) 之前
    highestBidder: auction.highestBidder,
    startingTime: auction.startingTime,
    duration: auction.duration,
    paymentToken: auction.paymentToken,
    startingPriceInDollar: auction.startingPriceInDollar,
    highestBid: auction.highestBid,
    highestBidInDollar: auction.highestBidInDollar,
    highestBidToken: auction.highestBidToken,
    id,
    status,
    endTime: auction.startingTime + auction.duration,
    ended,
  };
}

export const STATUS_LABEL: Record<AuctionStatus, string> = {
  "not-started": "未开始",
  active: "进行中",
  "ended-with-bid": "已结束",
  "ended-no-bid": "已结束·无人出价",
};

/** 最高出价的展示字符串（按 highestBidToken 判断 ETH/ERC20） */
export function formatHighestBid(auction: Auction): string {
  if (auction.highestBid === 0n) return "—";
  if (auction.highestBidToken === ZERO_ADDRESS) {
    return `${formatTokenAmount(auction.highestBid, 18)} ETH`;
  }
  return `${formatTokenAmount(auction.highestBid, USDC_DECIMALS)} USDC`;
}

/** 交易/调用错误 → 中文提示 */
export function toErrorMessage(err: unknown): string {
  const e = err as { reason?: string; code?: string; message?: string };
  // 合约自定义 require 文案
  if (typeof e?.reason === "string" && e.reason) {
    const map: Record<string, string> = {
      "not admin": "仅管理员可执行此操作",
      "invalid admin": "管理员地址无效",
      "invalid oracle": "预言机地址无效",
      "invalid nft": "NFT 地址无效",
      "invalid duration": "拍卖时长至少 30 秒",
      "invalid payment token": "支付代币无效",
      "not started": "拍卖尚未开始",
      ended: "拍卖已结束，无法出价",
      "amount mismatch": "ETH 出价金额与发送的 ETH 不一致",
      "invalid amount": "出价金额无效",
      "invalid startingPrice": "出价需高于起拍价",
      "invalid highestBid": "出价需高于当前最高出价",
      "not ended": "拍卖尚未到期，无法结算",
      "no bids": "无人出价，无法结束拍卖（NFT 锁定在合约中）",
      "oracle not set": "预言机未配置，请先在设置中配置价格源",
      // homework03 合约权限文案（Ownable）
      "not owner": "仅合约 owner（管理员）可执行此操作",
    };
    const zh = map[e.reason];
    if (zh) return zh;
    return e.reason;
  }
  // 钱包层错误
  if (e?.code === "ACTION_REJECTED") return "您取消了交易";
  if (e?.code === "INSUFFICIENT_FUNDS") return "余额不足";
  if (e?.code === "UNPREDICTABLE_GAS_LIMIT") return "交易无法预估 gas（请检查参数或授权）";
  if (e?.code === "NETWORK_ERROR") return "网络异常，请检查钱包网络连接";
  if (typeof e?.message === "string") {
    const msg = e.message.slice(0, 200);
    // OZ Ownable 的 revert 文案是 "Ownable: caller is not the owner"
    if (/caller is not the owner/i.test(msg)) return "仅合约 owner（管理员）可执行此操作";
    return msg || "操作失败";
  }
  return "操作失败";
}

/** 地址缩写 0x1234…abcd */
export function shortAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
