"use client";

import { useState, useCallback, useEffect } from "react";
import { useWeb3 } from "./useWeb3";
import { useAuctionContract } from "./useAuctionContract";
import { toAuctionView } from "@/lib/format";
import type { Auction, AuctionView } from "@/types";

/**
 * 拍卖列表：auctionId() → 批量查询 auctions(i) + isEnded(i)
 */
export function useAuctions() {
  const { account } = useWeb3();
  const { getReadContract } = useAuctionContract();
  const [auctions, setAuctions] = useState<AuctionView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const contract = getReadContract();
    if (!contract) {
      setAuctions([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const count = (await contract.auctionId()) as bigint;
      if (count === 0n) {
        setAuctions([]);
        return;
      }
      const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i));
      const results = await Promise.all(
        ids.map(async (id) => {
          const a = (await contract.auctions(id)) as Auction;
          return toAuctionView(id, a);
        }),
      );
      setAuctions(results);
    } catch (e: any) {
      console.error("useAuctions:", e);
      setError(e?.message || "加载拍卖列表失败");
    } finally {
      setLoading(false);
    }
  }, [getReadContract]);

  useEffect(() => {
    refresh();
  }, [refresh, account]);

  return { auctions, loading, error, refresh };
}
