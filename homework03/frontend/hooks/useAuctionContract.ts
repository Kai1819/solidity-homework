"use client";

import { useCallback } from "react";
import { Contract, ethers } from "ethers";
import { useWeb3 } from "./useWeb3";
import { MetaNFTAuctionV2ABI } from "@/lib/abis";
import { getAuctionAddress } from "@/lib/config";

/**
 * 拍卖合约实例工厂：只读用 provider，写操作需连接钱包用 signer
 */
export function useAuctionContract() {
  const { provider, signer } = useWeb3();

  const getReadContract = useCallback((): Contract | null => {
    const addr = getAuctionAddress();
    if (!addr || !provider) return null;
    return new ethers.Contract(addr, MetaNFTAuctionV2ABI, provider);
  }, [provider]);

  const getSignerContract = useCallback((): Contract | null => {
    const addr = getAuctionAddress();
    if (!addr || !signer) return null;
    return new ethers.Contract(addr, MetaNFTAuctionV2ABI, signer);
  }, [signer]);

  return { getReadContract, getSignerContract };
}
