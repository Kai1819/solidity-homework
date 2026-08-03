"use client";

import Link from "next/link";
import { Clock } from "lucide-react";
import type { AuctionView } from "@/types";
import { formatUsd, formatHighestBid, shortAddress } from "@/lib/format";
import AuctionStatusBadge from "./AuctionStatusBadge";
import CountdownTimer from "./CountdownTimer";
import NftPlaceholder from "./NftPlaceholder";

export default function AuctionCard({ auction }: { auction: AuctionView }) {
  return (
    <Link
      href={`/auction/${auction.id}`}
      className="group block rounded-2xl border border-slate-200/60 bg-white/70 p-4 shadow-sm backdrop-blur transition-all hover:shadow-md animate-slide-up"
    >
      <div className="relative">
        <NftPlaceholder nftId={auction.nftId} nftAddress={auction.nft} />
        <div className="absolute right-2 top-2">
          <AuctionStatusBadge status={auction.status} />
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-slate-800">
            拍卖 #{auction.id.toString()}
          </h3>
          <span className="font-mono text-xs text-slate-400">
            卖家 {shortAddress(auction.seller)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">起拍价</span>
          <span className="font-mono font-medium text-slate-700">
            {formatUsd(auction.startingPriceInDollar)}
          </span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">最高出价</span>
          <span className="font-mono font-medium text-sky-700">
            {formatHighestBid(auction)}
            {auction.highestBid > 0n && (
              <span className="ml-1 text-xs text-slate-400">
                {formatUsd(auction.highestBidInDollar)}
              </span>
            )}
          </span>
        </div>

        {auction.status === "active" && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-sm">
            <span className="flex items-center gap-1 text-slate-500">
              <Clock size={13} /> 剩余
            </span>
            <CountdownTimer endTime={auction.endTime} />
          </div>
        )}
      </div>
    </Link>
  );
}
