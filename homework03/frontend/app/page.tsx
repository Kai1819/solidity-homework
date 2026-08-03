"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Sparkles, Droplets, ShieldCheck } from "lucide-react";
import { useAuctions } from "@/hooks/useAuctions";
import { useWeb3 } from "@/components/Web3Provider";
import { useAuctionContract } from "@/hooks/useAuctionContract";
import { useAdmin } from "@/hooks/useAdmin";
import { useLocalAuxAddresses } from "@/hooks/useLocalAuxAddresses";
import { isAuxConfigured } from "@/lib/config";
import AuctionCard from "@/components/AuctionCard";
import Modal from "@/components/Modal";
import MintPanel from "@/components/MintPanel";
import FaucetModal from "@/components/FaucetModal";
import type { AuctionStatus } from "@/types";

type Filter = "all" | "active" | "ended";

export default function HomePage() {
  const { account, connectWallet, isConnecting } = useWeb3();
  const { auctions, loading, refresh } = useAuctions();
  const { getSignerContract } = useAuctionContract();
  const { isAdmin } = useAdmin(account ? getSignerContract() : null);
  const localAux = useLocalAuxAddresses(); // client-only localStorage
  const [filter, setFilter] = useState<Filter>("all");
  const [showMint, setShowMint] = useState(false);
  const [showFaucet, setShowFaucet] = useState(false);

  const envAuxReady = isAuxConfigured();
  // 客户端 mount 后若 localStorage 有配置也视为已配置（避免 env-only 误判）
  const auxReady = envAuxReady || Boolean(localAux);
  const auxSource: "env" | "localStorage" | "none" = envAuxReady ? "env" : localAux ? "localStorage" : "none";

  const filtered = auctions.filter((a) => {
    if (filter === "active") return a.status === "active";
    if (filter === "ended") return a.status === "ended-with-bid" || a.status === "ended-no-bid";
    return true;
  });

  return (
    <div className="space-y-8">
      {/* 未初始化 banner */}
      {!auxReady && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 animate-slide-up">
          <span className="flex items-center gap-2">
            <AlertTriangle size={16} />
            MetaNFT / USDC / Oracle 尚未配置
            {auxSource === "localStorage" ? "（localStorage 已存配置）" : ""}
          </span>
          <Link
            href="/setup"
            className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 transition-colors"
          >
            前往初始化
          </Link>
        </div>
      )}

      {/* Hero */}
      <section className="text-center py-8">
        <h1 className="text-3xl font-bold tracking-tight text-slate-800 sm:text-4xl">
          MetaNFT <span className="bg-gradient-to-r from-sky-600 to-indigo-600 bg-clip-text text-transparent">拍卖市场</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-slate-500">
          在 Sepolia 测试网参与 NFT 竞拍 —— 支持 ETH 与 USDC 双模式出价，链上结算、自动退款。
        </p>
      </section>

      {/* 快捷操作 */}
      <section className="flex flex-wrap items-center justify-center gap-3">
        {!account ? (
          <button
            onClick={connectWallet}
            disabled={isConnecting}
            className="rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {isConnecting ? "连接中…" : "连接钱包开始体验"}
          </button>
        ) : (
          <>
            {auxReady && (
              <>
                <button
                  onClick={() => setShowMint(true)}
                  className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200/70 transition-colors"
                >
                  <Sparkles size={15} /> 铸造 NFT
                </button>
                <button
                  onClick={() => setShowFaucet(true)}
                  className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200/70 transition-colors"
                >
                  <Droplets size={15} /> 领取 USDC
                </button>
              </>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors"
              >
                <ShieldCheck size={15} /> 管理面板
              </Link>
            )}
          </>
        )}
      </section>

      {/* 过滤 tabs */}
      <section className="flex items-center justify-center gap-2">
        {(
          [
            ["all", "全部"],
            ["active", "进行中"],
            ["ended", "已结束"],
          ] as [Filter, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
              filter === key
                ? "bg-sky-600 text-white"
                : "bg-white/70 text-slate-600 hover:bg-slate-100"
            }`}
          >
            {label}
            {key !== "all" && (
              <span className="ml-1 text-xs opacity-70">
                {
                  auctions.filter((a) =>
                    key === "active"
                      ? a.status === "active"
                      : a.status === "ended-with-bid" || a.status === "ended-no-bid",
                  ).length
                }
              </span>
            )}
          </button>
        ))}
      </section>

      {/* 拍卖列表 */}
      <section>
        {loading && auctions.length === 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-100/70" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16 text-center">
            <p className="text-slate-500">暂无拍卖</p>
            <p className="mt-2 text-sm text-slate-400">
              {isAdmin
                ? "前往管理面板启动第一个拍卖吧"
                : "等待管理员在管理面板启动拍卖"}
            </p>
            {isAdmin && (
              <Link
                href="/admin"
                className="mt-4 inline-block rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-2 text-sm font-medium text-white"
              >
                去启动拍卖
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((a) => (
              <AuctionCard key={a.id.toString()} auction={a} />
            ))}
          </div>
        )}
      </section>

      <Modal open={showMint} onClose={() => setShowMint(false)} title="铸造 NFT">
        <MintPanel onDone={refresh} />
      </Modal>
      <Modal open={showFaucet} onClose={() => setShowFaucet(false)} title="领取 USDC 测试币">
        <FaucetModal onClose={() => setShowFaucet(false)} />
      </Modal>
    </div>
  );
}
