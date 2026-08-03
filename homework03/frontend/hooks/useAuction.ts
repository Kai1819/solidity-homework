"use client";

import { useState, useCallback, useEffect } from "react";
import { ZERO_ADDRESS } from "@/lib/constants";
import { useWeb3 } from "./useWeb3";
import { useAuctionContract } from "./useAuctionContract";
import { useAuxContracts } from "./useAuxContracts";
import { toAuctionView } from "@/lib/format";
import type { Auction, AuctionView, TokenPrices } from "@/types";

/**
 * 单拍卖详情 + ETH/USDC 价格（oracle 未配置时返回 null，不抛错）
 */
export function useAuction(id: bigint | null) {
  const { account } = useWeb3();
  const { getReadContract } = useAuctionContract();
  const { getUsdcAddress } = useAuxContracts();
  const [auction, setAuction] = useState<AuctionView | null>(null);
  const [prices, setPrices] = useState<TokenPrices>({ eth: null, usdc: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const contract = getReadContract();
    if (!contract || id === null) return;
    setLoading(true);
    setError(null);
    try {
      const raw = (await contract.auctions(id)) as Auction;
      const usdcAddr = getUsdcAddress();
      setAuction(toAuctionView(id, raw));

      const [ethPrice, usdcPrice] = await Promise.all([
        contract
          .getPriceInDollar(ZERO_ADDRESS)
          .catch(() => null),
        usdcAddr
          ? contract.getPriceInDollar(usdcAddr).catch(() => null)
          : Promise.resolve(null),
      ]);
      setPrices({ eth: ethPrice as bigint | null, usdc: usdcPrice as bigint | null });
    } catch (e: any) {
      console.error("useAuction:", e);
      setError(e?.message || "加载拍卖详情失败");
    } finally {
      setLoading(false);
    }
  }, [getReadContract, getUsdcAddress, id]);

  useEffect(() => {
    refresh();
  }, [refresh, account, id]);

  return { auction, prices, loading, error, refresh };
}
