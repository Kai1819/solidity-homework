"use client";

import { useState } from "react";
import { Play, Settings2, RefreshCw } from "lucide-react";
import type { AuctionView } from "@/types";
import { formatUsd, formatHighestBid, shortAddress, STATUS_LABEL } from "@/lib/format";
import AuctionStatusBadge from "./AuctionStatusBadge";
import StartAuctionModal from "./StartAuctionModal";
import SetOracleModal from "./SetOracleModal";
import EndAuctionButton from "./EndAuctionButton";

export default function AdminPanel({
  auctions,
  onRefresh,
  oracleState,
  onOracleChanged,
}: {
  auctions: AuctionView[];
  onRefresh: () => void;
  oracleState?: { eth: string; usdc: string };
  onOracleChanged?: () => void;
}) {
  const [showStart, setShowStart] = useState(false);
  const [showOracle, setShowOracle] = useState(false);

  return (
    <div className="space-y-6">
      {/* 快捷操作 */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          onClick={() => setShowStart(true)}
          className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white/70 p-5 text-left shadow-sm hover:shadow-md transition-shadow"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white">
            <Play size={18} />
          </span>
          <span>
            <span className="block font-medium text-slate-800">启动拍卖</span>
            <span className="block text-xs text-slate-500">需要卖家先授权 NFT（setApprovalForAll）</span>
          </span>
        </button>

        <button
          onClick={() => setShowOracle(true)}
          className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white/70 p-5 text-left shadow-sm hover:shadow-md transition-shadow"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-700 text-white">
            <Settings2 size={18} />
          </span>
          <span>
            <span className="block font-medium text-slate-800">设置价格源</span>
            <span className="block text-xs text-slate-500">为 ETH / USDC 配置 Oracle 喂价</span>
          </span>
        </button>
      </div>

      {/* 价格源状态 */}
      <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-5">
        <h3 className="text-sm font-semibold text-slate-800">价格源状态</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">ETH (0x000…0) →</span>{" "}
            <span className="font-mono text-xs">
              {oracleState?.eth ? `${shortAddress(oracleState.eth)}` : "未配置"}
            </span>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="text-slate-500">USDC →</span>{" "}
            <span className="font-mono text-xs">
              {oracleState?.usdc ? `${shortAddress(oracleState.usdc)}` : "未配置"}
            </span>
          </div>
        </div>
      </div>

      {/* 拍卖列表管理 */}
      <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">
            拍卖列表（{auctions.length}）
          </h3>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-sky-600 transition-colors"
          >
            <RefreshCw size={13} /> 刷新
          </button>
        </div>

        {auctions.length === 0 ? (
          <p className="mt-4 rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-400">
            暂无拍卖，点击「启动拍卖」创建第一个
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {auctions.map((a) => (
              <div
                key={a.id.toString()}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800">
                      拍卖 #{a.id.toString()} · MNFT #{a.nftId.toString()}
                    </span>
                    <AuctionStatusBadge status={a.status} />
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    卖家 {shortAddress(a.seller)} · 起拍 {formatUsd(a.startingPriceInDollar)} · 最高{" "}
                    {formatHighestBid(a)}
                  </p>
                </div>
                {a.status === "ended-with-bid" ? (
                  <EndAuctionButton
                    auctionId={a.id}
                    onDone={onRefresh}
                  />
                ) : a.status === "ended-no-bid" ? (
                  <span className="text-xs text-amber-600" title="合约无法 end，NFT 锁定">
                    {STATUS_LABEL["ended-no-bid"]}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <StartAuctionModal
        open={showStart}
        onClose={() => setShowStart(false)}
        onSuccess={onRefresh}
      />
      <SetOracleModal
        open={showOracle}
        onClose={() => setShowOracle(false)}
        onSuccess={() => {
          onOracleChanged?.();
          onRefresh();
        }}
      />
    </div>
  );
}
