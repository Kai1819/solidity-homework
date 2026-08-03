"use client";

import { useState } from "react";
import Link from "next/link";
import { Wallet, Gavel } from "lucide-react";
import { useWeb3 } from "@/components/Web3Provider";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuctionContract } from "@/hooks/useAuctionContract";
import AccountDetailsModal from "./AccountDetailsModal";
import { shortAddress } from "@/lib/format";

export default function Header() {
  const { account, connectWallet, disconnect, isConnecting } = useWeb3();
  const { getSignerContract } = useAuctionContract();
  const { isAdmin } = useAdmin(account ? getSignerContract() : null);
  const [showAccount, setShowAccount] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/70 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-800">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 text-white">
              <Gavel size={16} />
            </span>
            <span>
              MetaNFT <span className="text-sky-600">Auction</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-4 text-sm text-slate-600 sm:flex">
            <Link href="/" className="hover:text-sky-600 transition-colors">
              拍卖市场
            </Link>
            <Link href="/assets" className="hover:text-sky-600 transition-colors">
              我的资产
            </Link>
            {isAdmin && (
              <Link href="/admin" className="hover:text-sky-600 transition-colors">
                管理面板
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          {account ? (
            <>
              <button
                onClick={() => setShowAccount(true)}
                className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200/70 transition-colors"
              >
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {shortAddress(account)}
              </button>
              <button
                onClick={disconnect}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-400 hover:text-slate-600 transition-colors"
              >
                断开
              </button>
            </>
          ) : (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              <Wallet size={15} />
              {isConnecting ? "连接中…" : "连接钱包"}
            </button>
          )}
        </div>
      </div>

      <AccountDetailsModal
        isOpen={showAccount}
        onClose={() => setShowAccount(false)}
      />
    </header>
  );
}
