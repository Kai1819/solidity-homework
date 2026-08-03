"use client";

import { useWeb3 } from "./Web3Provider";
import { shortAddress } from "@/lib/format";

export default function ConnectButton({ compact = false }: { compact?: boolean }) {
  const { account, connectWallet, disconnect, isConnecting } = useWeb3();

  if (account) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm text-slate-700">
          {shortAddress(account)}
        </span>
        {!compact && (
          <button
            onClick={disconnect}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            断开
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={connectWallet}
      disabled={isConnecting}
      className="rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {isConnecting ? "连接中…" : "连接钱包"}
    </button>
  );
}
