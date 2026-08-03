"use client";

import { useState, useCallback, useEffect } from "react";
import { formatEther, formatUnits } from "ethers";
import { useWeb3 } from "./useWeb3";
import { useAuxContracts } from "./useAuxContracts";
import { USDC_DECIMALS } from "@/lib/constants";

export interface Balances {
  eth: string | null;
  usdc: string | null;
  ethRaw: bigint | null;
  usdcRaw: bigint | null;
}

/**
 * ETH / USDC 余额管理（account 变化与手动 refresh 驱动）
 */
export function useBalances() {
  const { provider, account } = useWeb3();
  const { getUsdcContract } = useAuxContracts();
  const [balances, setBalances] = useState<Balances>({
    eth: null,
    usdc: null,
    ethRaw: null,
    usdcRaw: null,
  });

  const refresh = useCallback(async () => {
    if (!provider || !account) {
      setBalances({ eth: null, usdc: null, ethRaw: null, usdcRaw: null });
      return;
    }
    try {
      const ethRaw = await provider.getBalance(account);
      const usdcContract = getUsdcContract();
      const usdcRaw = usdcContract
        ? ((await usdcContract.balanceOf(account)) as bigint)
        : null;
      setBalances({
        eth: formatEther(ethRaw),
        usdc: usdcRaw !== null ? formatUnits(usdcRaw, USDC_DECIMALS) : null,
        ethRaw,
        usdcRaw,
      });
    } catch (e) {
      console.error("useBalances:", e);
    }
  }, [provider, account, getUsdcContract]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...balances, refresh };
}
