"use client";

import { LS_AUCTION_CONFIG, SEPOLIA_CHAIN_ID } from "./constants";
import type { SetupAddresses } from "@/types";

/**
 * 地址解析：env > localStorage（/setup 向导写入）> 空
 * 注意：localStorage 只能在客户端读取，服务端渲染时返回 env 值。
 */

export function getAuctionAddress(): string {
  return process.env.NEXT_PUBLIC_AUCTION_ADDRESS || "";
}

export function getProxyAdminAddress(): string {
  return process.env.NEXT_PUBLIC_PROXY_ADMIN_ADDRESS || "";
}

export function getAdminAddress(): string {
  return process.env.NEXT_PUBLIC_ADMIN_ADDRESS || "";
}

export function getChainId(): number {
  const v = Number(process.env.NEXT_PUBLIC_CHAIN_ID || SEPOLIA_CHAIN_ID);
  return Number.isFinite(v) && v > 0 ? v : SEPOLIA_CHAIN_ID;
}

export function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_RPC_URL || "";
}

export function getEtherscanUrl(): string {
  return process.env.NEXT_PUBLIC_ETHERSCAN_API_URL || "https://sepolia.etherscan.io";
}

/** 从 localStorage 读取辅助合约地址（必须仅在客户端调用，SSR 会返回 null） */
export function getLocalAddresses(): SetupAddresses | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_AUCTION_CONFIG);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SetupAddresses>;
    if (parsed.metaNFT && parsed.usdc && parsed.oracle) {
      return {
        metaNFT: parsed.metaNFT,
        usdc: parsed.usdc,
        oracle: parsed.oracle,
        // 旧配置可能没有 deployBlocks，透传（undefined 不影响 JSON 序列化）
        deployBlocks: parsed.deployBlocks,
      };
    }
  } catch {
    // ignore
  }
  return null;
}

// ---- 以下函数仅读 env（SSR-safe），不再同步读 localStorage ----
// 客户端组件若需结合 localStorage，请在 useEffect 中读 getLocalAddresses() 后合并到 state。

export function getMetaNFTAddress(): string {
  return process.env.NEXT_PUBLIC_META_NFT_ADDRESS || "";
}

export function getUsdcAddress(): string {
  return process.env.NEXT_PUBLIC_USDC_ADDRESS || "";
}

export function getOracleAddress(): string {
  return process.env.NEXT_PUBLIC_ORACLE_ADDRESS || "";
}

/** 辅助合约是否已全部配置（仅基于 env） */
export function isAuxConfigured(): boolean {
  return Boolean(getMetaNFTAddress() && getUsdcAddress() && getOracleAddress());
}

/** 地址来源说明（仅基于 env） */
export function getAuxSource(): "env" | "none" {
  if (process.env.NEXT_PUBLIC_META_NFT_ADDRESS && process.env.NEXT_PUBLIC_USDC_ADDRESS && process.env.NEXT_PUBLIC_ORACLE_ADDRESS) {
    return "env";
  }
  return "none";
}

/** 保存辅助合约地址到 localStorage（客户端 only） */
export function saveAuxConfigToLocalStorage(addresses: SetupAddresses): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LS_AUCTION_CONFIG, JSON.stringify(addresses));
}
