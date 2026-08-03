"use client";

import { useCallback, useEffect, useState } from "react";
import { Contract, ethers } from "ethers";
import { useWeb3 } from "./useWeb3";
import {
  getMetaNFTAddress as configGetMetaNFT,
  getUsdcAddress as configGetUsdc,
  getOracleAddress as configGetOracle,
  getAuctionAddress as configGetAuction,
  getLocalAddresses,
} from "@/lib/config";
import { MockERC20ABI, MetaNFTABI, MockOracleABI } from "@/lib/abis";
import type { SetupAddresses } from "@/types";

/**
 * 辅助合约（MetaNFT / USDC / Oracle）实例工厂。
 * 地址解析：env > localStorage（客户端 mount 后合并，避免 hydration mismatch）。
 * SSR 与客户端首次渲染均返回 env 值（一致）；mount 后 useEffect 读 localStorage 更新。
 */
export function useAuxContracts() {
  const { provider, signer } = useWeb3();
  const [localAddrs, setLocalAddrs] = useState<SetupAddresses | null>(null);

  // 客户端 mount 后读 localStorage（SSR 时跳过，保证 hydration 一致）
  useEffect(() => {
    setLocalAddrs(getLocalAddresses());
  }, []);

  // 合并后的地址 getter：env 优先，fallback localStorage
  const getMetaNFTAddress = useCallback(
    () => configGetMetaNFT() || localAddrs?.metaNFT || "",
    [localAddrs],
  );
  const getUsdcAddress = useCallback(
    () => configGetUsdc() || localAddrs?.usdc || "",
    [localAddrs],
  );
  const getOracleAddress = useCallback(
    () => configGetOracle() || localAddrs?.oracle || "",
    [localAddrs],
  );

  const getMetaNFTContract = useCallback(
    (withSigner = false): Contract | null => {
      const addr = getMetaNFTAddress();
      const runner = withSigner ? signer : provider;
      if (!addr || !runner) return null;
      return new ethers.Contract(addr, MetaNFTABI, runner);
    },
    [provider, signer, getMetaNFTAddress],
  );

  const getUsdcContract = useCallback(
    (withSigner = false): Contract | null => {
      const addr = getUsdcAddress();
      const runner = withSigner ? signer : provider;
      if (!addr || !runner) return null;
      return new ethers.Contract(addr, MockERC20ABI, runner);
    },
    [provider, signer, getUsdcAddress],
  );

  const getOracleContract = useCallback(
    (withSigner = false): Contract | null => {
      const addr = getOracleAddress();
      const runner = withSigner ? signer : provider;
      if (!addr || !runner) return null;
      return new ethers.Contract(addr, MockOracleABI, runner);
    },
    [provider, signer, getOracleAddress],
  );

  const getAuctionAddress = useCallback(() => configGetAuction(), []);

  return {
    getMetaNFTAddress,
    getUsdcAddress,
    getOracleAddress,
    getAuctionAddress,
    getMetaNFTContract,
    getUsdcContract,
    getOracleContract,
  };
}
