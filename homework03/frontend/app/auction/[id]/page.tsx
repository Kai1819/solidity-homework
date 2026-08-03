"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Trophy, AlertTriangle } from "lucide-react";
import { useAuction } from "@/hooks/useAuction";
import { useWeb3 } from "@/components/Web3Provider";
import { useTx } from "@/hooks/useTx";
import { useAuctionContract } from "@/hooks/useAuctionContract";
import { useAlert } from "@/components/AlertProvider";
import { formatUsd, formatHighestBid, shortAddress, toErrorMessage } from "@/lib/format";
import { getEtherscanUrl, getAuctionAddress } from "@/lib/config";
import AuctionStatusBadge from "@/components/AuctionStatusBadge";
import CountdownTimer from "@/components/CountdownTimer";
import NftPlaceholder from "@/components/NftPlaceholder";
import BidModal from "@/components/BidModal";

export default function AuctionDetailPage() {
  const params = useParams<{ id: string }>();
  const rawId = params.id || "0";
  // 防止非数字 id（如 /auction/abc）导致 BigInt 抛异常崩溃整页
  const id = /^\d+$/.test(rawId) ? BigInt(rawId) : null;
  const { auction, prices, loading, refresh } = useAuction(id);
  const { account, connectWallet } = useWeb3();
  const { getSignerContract, getReadContract } = useAuctionContract();
  const { run, sending } = useTx();
  const { showSuccess } = useAlert();
  const [showBid, setShowBid] = useState(false);
  // 动态读取当前代理实现版本（homework03 当前为 V1，升级 V2 后自动变化）
  const [implVersion, setImplVersion] = useState<string | null>(null);

  const etherscan = getEtherscanUrl();

  useEffect(() => {
    let cancelled = false;
    getReadContract()
      ?.getVersion()
      .then((v: string) => {
        if (!cancelled) setImplVersion(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [getReadContract]);

  if (id === null) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16 text-center">
        <p className="text-slate-500">无效的拍卖 ID：{rawId}</p>
        <Link href="/" className="mt-3 inline-block text-sky-600 hover:underline">
          返回首页
        </Link>
      </div>
    );
  }

  const handleEnd = async () => {
    const contract = getSignerContract();
    if (!contract) return;
    await run(
      async () => {
        const tx = await contract.end(id);
        await tx.wait();
        return tx;
      },
      {
        successMsg: "拍卖已结算，NFT 已交付给出价者",
        onSuccess: () => refresh(),
      },
    );
  };

  if (loading && !auction) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-32 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100/70" />
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-16 text-center">
        <p className="text-slate-500">未找到该拍卖（ID: {params.id}）</p>
        <Link href="/" className="mt-3 inline-block text-sky-600 hover:underline">
          返回首页
        </Link>
      </div>
    );
  }

  const isSeller = account?.toLowerCase() === auction.seller.toLowerCase();
  const isHighestBidder = account?.toLowerCase() === auction.highestBidder.toLowerCase();

  return (
    <div className="space-y-6 animate-slide-up">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-sky-600 transition-colors"
      >
        <ArrowLeft size={15} /> 返回拍卖市场
      </Link>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 左：NFT 展示 */}
        <div>
          <NftPlaceholder nftId={auction.nftId} size="lg" nftAddress={auction.nft} />
          <div className="mt-3 space-y-1 text-sm text-slate-500">
            <p>
              NFT 合约：
              <a
                href={`${etherscan}/token/${auction.nft}`}
                target="_blank"
                rel="noreferrer"
                className="ml-1 font-mono text-sky-600 hover:underline"
              >
                {shortAddress(auction.nft)}
                <ExternalLink size={11} className="inline ml-0.5" />
              </a>
            </p>
            <p>
              卖家：
              <a
                href={`${etherscan}/address/${auction.seller}`}
                target="_blank"
                rel="noreferrer"
                className="ml-1 font-mono text-sky-600 hover:underline"
              >
                {shortAddress(auction.seller)}
                <ExternalLink size={11} className="inline ml-0.5" />
              </a>
              {isSeller && <span className="ml-2 text-xs text-slate-400">（您）</span>}
            </p>
          </div>
        </div>

        {/* 右：信息与操作 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-slate-800">
              拍卖 #{auction.id.toString()}
            </h1>
            <AuctionStatusBadge status={auction.status} />
          </div>

          <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-5 backdrop-blur">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-500">起拍价</p>
                <p className="mt-1 font-mono text-lg font-semibold text-slate-800">
                  {formatUsd(auction.startingPriceInDollar)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">支付代币</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-700">
                  {auction.paymentToken === "0x0000000000000000000000000000000000000000"
                    ? "ETH"
                    : shortAddress(auction.paymentToken)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">最高出价</p>
                <p className="mt-1 font-mono text-lg font-semibold text-sky-700">
                  {formatHighestBid(auction)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">折合美元</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-700">
                  {formatUsd(auction.highestBidInDollar)}
                </p>
              </div>
            </div>

            {auction.status === "active" && (
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">剩余时间</span>
                <CountdownTimer endTime={auction.endTime} />
              </div>
            )}

            {auction.highestBidder !== "0x0000000000000000000000000000000000000000" && (
              <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3 text-sm">
                <span className="text-slate-500">最高出价者</span>
                <a
                  href={`${etherscan}/address/${auction.highestBidder}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sky-600 hover:underline"
                >
                  {shortAddress(auction.highestBidder)}
                </a>
              </div>
            )}
          </div>

          {/* 价格行情 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-100 bg-white/60 p-3 text-sm">
              <p className="text-xs text-slate-500">ETH 价格</p>
              <p className="mt-0.5 font-mono font-semibold text-slate-700">
                {formatUsd(prices.eth)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-white/60 p-3 text-sm">
              <p className="text-xs text-slate-500">USDC 价格</p>
              <p className="mt-0.5 font-mono font-semibold text-slate-700">
                {formatUsd(prices.usdc)}
              </p>
            </div>
          </div>

          {/* 操作区（状态机） */}
          {auction.status === "active" && !isSeller && (
            <>
              {isHighestBidder && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
                  <Trophy size={15} />
                  您当前领先！再次自抬价不会返还此前出价（合约限制），请谨慎操作。
                </div>
              )}
              {!account ? (
                <button
                  onClick={connectWallet}
                  className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-3 font-medium text-white hover:opacity-90 transition-opacity"
                >
                  连接钱包参与竞拍
                </button>
              ) : (
                <button
                  onClick={() => setShowBid(true)}
                  className="w-full rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-3 font-medium text-white hover:opacity-90 transition-opacity"
                >
                  出价竞拍
                </button>
              )}
            </>
          )}

          {auction.status === "ended-with-bid" && (
            <button
              onClick={handleEnd}
              disabled={sending}
              className="w-full rounded-xl bg-slate-800 px-4 py-3 font-medium text-white hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              {sending ? "结算中…" : "拍卖已到期 — 结束拍卖并结算"}
            </button>
          )}

          {auction.status === "ended-no-bid" && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <p>
                该拍卖无人出价，合约无法执行 end()，NFT 将永久锁定在合约中。如需取回需联系合约升级。
              </p>
            </div>
          )}

          <p className="text-center text-xs text-slate-400">
            拍卖合约：
            <span className="font-mono">{shortAddress(getAuctionAddress())}</span>
            （透明代理{implVersion ? ` · ${implVersion}` : ""}）
          </p>
        </div>
      </div>

      <BidModal
        auction={auction}
        prices={prices}
        open={showBid}
        onClose={() => setShowBid(false)}
        onSuccess={() => {
          setShowBid(false);
          refresh();
          showSuccess("出价成功！若被超越将自动原路退回", "竞拍成功");
        }}
      />
    </div>
  );
}
