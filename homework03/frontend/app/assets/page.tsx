"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Image as ImageIcon, Hammer, Package } from "lucide-react";
import { useWeb3 } from "@/components/Web3Provider";
import { useAuctions } from "@/hooks/useAuctions";
import { useAuxContracts } from "@/hooks/useAuxContracts";
import { useLocalAuxAddresses } from "@/hooks/useLocalAuxAddresses";
import { useMetaNFT } from "@/hooks/useMetaNFT";
import { formatUsd, shortAddress, toErrorMessage } from "@/lib/format";
import NftPlaceholder from "@/components/NftPlaceholder";
import { isAuxConfigured } from "@/lib/config";
import { chunkedGetLogs } from "@/lib/chunkedGetLogs";
import type { AuctionView } from "@/types";

/** 我的资产：持有的 NFT + 参与的拍卖 */
export default function AssetsPage() {
  const { account, connectWallet, provider } = useWeb3();
  const { auctions } = useAuctions();
  const metaNFT = useMetaNFT();
  const { getMetaNFTContract, getMetaNFTAddress } = useAuxContracts();
  const localAux = useLocalAuxAddresses();

  const [ownedNfts, setOwnedNfts] = useState<bigint[]>([]);
  const [loadingNfts, setLoadingNfts] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<string | null>(null);

  const envAuxReady = isAuxConfigured();
  const auxReady = envAuxReady || Boolean(localAux);
  const me = account?.toLowerCase() || "";

  // 通过 ERC721 Transfer 事件重建 owned set
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!account || !provider || !auxReady) {
        setOwnedNfts([]);
        return;
      }
      setLoadingNfts(true);
      setError(null);
      try {
        const contract = getMetaNFTContract();
        if (!contract) {
          setOwnedNfts([]);
          return;
        }
        // 解析 Transfer 事件的 topics 数组（DeferredTopicFilter 需 getTopicFilter() 拿到实际 topics），
        // 并显式带上合约地址，避免漏传导致查询全链日志
        const topics = await contract.filters.Transfer().getTopicFilter();
        const filter = { address: await contract.getAddress(), topics };
        // 从部署区块开始扫（localStorage 有 deployBlocks 时），否则从 0 分块兜底
        const fromBlock = localAux?.deployBlocks?.metaNFT ?? 0;
        const logs = await chunkedGetLogs(provider, filter, fromBlock, "latest", {
          onProgress: (done, total) => {
            if (total > 1 && !cancelled) {
              setScanProgress(`正在扫描链上记录 ${done}/${total} 段…`);
            }
          },
        });
        if (cancelled) return;

        const owned = new Set<bigint>();
        for (const log of logs) {
          const parsed = contract.interface.parseLog(log);
          if (!parsed || parsed.name !== "Transfer") continue;
          const from = (parsed.args[0] as string).toLowerCase();
          const to = (parsed.args[1] as string).toLowerCase();
          const tokenId = parsed.args[2] as bigint;
          if (to === me) owned.add(tokenId);
          if (from === me) owned.delete(tokenId);
        }
        setOwnedNfts(Array.from(owned).sort((a, b) => (a < b ? -1 : 1)));
      } catch (e: any) {
        console.error("load owned nfts:", e);
        if (!cancelled) setError(toErrorMessage(e));
      } finally {
        if (!cancelled) {
          setLoadingNfts(false);
          setScanProgress(null);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [account, provider, auxReady, getMetaNFTContract, me, localAux]);

  if (!account) {
    return (
      <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-10 text-center">
        <p className="text-slate-600">请先连接钱包查看资产</p>
        <button
          onClick={connectWallet}
          className="mt-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-2.5 text-sm font-medium text-white"
        >
          连接钱包
        </button>
      </div>
    );
  }

  const myBids = auctions.filter((a) => a.highestBidder.toLowerCase() === me);
  const myListings = auctions.filter((a) => a.seller.toLowerCase() === me);
  const myWins = auctions.filter(
    (a) => a.status === "ended-with-bid" && a.highestBidder.toLowerCase() === me,
  );

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex items-center gap-2">
        <Package size={20} className="text-sky-600" />
        <h1 className="text-2xl font-bold text-slate-800">我的资产</h1>
        <span className="ml-2 font-mono text-sm text-slate-400">{shortAddress(account)}</span>
      </div>

      {!auxReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          辅助合约未配置，无法加载 NFT 数据。
          <Link href="/setup" className="ml-2 text-amber-600 underline">
            前往初始化
          </Link>
        </div>
      )}

      {/* 持有的 NFT */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ImageIcon size={15} /> 我持有的 NFT（{ownedNfts.length}）
        </h2>
        {loadingNfts && scanProgress && (
          <p className="mb-2 text-xs text-slate-400">{scanProgress}</p>
        )}
        {loadingNfts ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-100/70" />
            ))}
          </div>
        ) : ownedNfts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 py-8 text-center text-sm text-slate-400">
            {error ? `加载失败：${error}` : "暂未持有 NFT，可先铸造一个"}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ownedNfts.map((id) => (
              <div key={id.toString()} className="rounded-xl border border-slate-200/60 bg-white/70 p-2 shadow-sm">
                <NftPlaceholder nftId={id} nftAddress={getMetaNFTAddress()} />
                <p className="mt-2 text-center font-mono text-sm font-medium text-slate-700">
                  MNFT #{id.toString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 我参与的拍卖 */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Hammer size={15} /> 我参与的拍卖（{myBids.length}）
        </h2>
        {myBids.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 py-8 text-center text-sm text-slate-400">
            暂无参与记录
          </div>
        ) : (
          <div className="space-y-2">
            {myBids.map((a) => (
              <AssetRow key={a.id.toString()} auction={a} highlight={a.highestBidder.toLowerCase() === me} />
            ))}
          </div>
        )}
      </section>

      {/* 我卖出的拍卖 */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Package size={15} /> 我卖出的拍卖（{myListings.length}）
        </h2>
        {myListings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white/50 py-8 text-center text-sm text-slate-400">
            暂无卖出记录
          </div>
        ) : (
          <div className="space-y-2">
            {myListings.map((a) => (
              <AssetRow key={a.id.toString()} auction={a} />
            ))}
          </div>
        )}
      </section>

      {/* 我拍得的拍卖 */}
      {myWins.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-emerald-700">🏆 我拍得的（{myWins.length}）</h2>
          <div className="space-y-2">
            {myWins.map((a) => (
              <AssetRow key={a.id.toString()} auction={a} won />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function AssetRow({
  auction,
  highlight = false,
  won = false,
}: {
  auction: AuctionView;
  highlight?: boolean;
  won?: boolean;
}) {
  return (
    <Link
      href={`/auction/${auction.id}`}
      className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-shadow hover:shadow-sm ${
        won
          ? "border-emerald-200 bg-emerald-50/60"
          : highlight
            ? "border-sky-200 bg-sky-50/60"
            : "border-slate-200/60 bg-white/70"
      }`}
    >
      <div className="flex items-center gap-3">
        <NftPlaceholder nftId={auction.nftId} size="sm" nftAddress={auction.nft} />
        <div>
          <p className="font-medium text-slate-800">
            拍卖 #{auction.id.toString()} · MNFT #{auction.nftId.toString()}
          </p>
          <p className="text-xs text-slate-500">
            最高 {formatUsd(auction.highestBidInDollar)}
            {highlight && " · 您领先"}
            {won && " · 已拍得"}
          </p>
        </div>
      </div>
      <span className="text-xs text-sky-600">查看 →</span>
    </Link>
  );
}
