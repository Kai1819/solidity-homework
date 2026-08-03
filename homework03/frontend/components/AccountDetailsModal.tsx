"use client";

import { useState, useEffect } from "react";
import { Copy, ExternalLink, X, Check } from "lucide-react";
import { useWeb3 } from "./Web3Provider";
import { useBalances } from "@/hooks/useBalances";
import { getEtherscanUrl } from "@/lib/config";
import { shortAddress } from "@/lib/format";

export default function AccountDetailsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { account } = useWeb3();
  const balances = useBalances();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) balances.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen || !account) return null;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const etherscan = getEtherscanUrl();

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">账户详情</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 rounded-xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm break-all text-slate-700">{account}</span>
            <button
              onClick={copyAddress}
              className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
              title="复制地址"
            >
              {copied ? <Check size={15} className="text-emerald-500" /> : <Copy size={15} />}
            </button>
          </div>
          <a
            href={`${etherscan}/address/${account}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-xs text-sky-600 hover:underline"
          >
            在 Etherscan 查看 <ExternalLink size={12} />
          </a>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-500">ETH 余额</p>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-800">
              {balances.eth ?? "—"}
            </p>
            <p className="text-xs text-slate-400">Sepolia ETH</p>
          </div>
          <div className="rounded-xl border border-slate-100 p-4">
            <p className="text-xs text-slate-500">USDC 余额</p>
            <p className="mt-1 font-mono text-lg font-semibold text-slate-800">
              {balances.usdc ?? "—"}
            </p>
            <p className="text-xs text-slate-400">测试 USDC</p>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">账户地址缩写：{shortAddress(account)}</p>
      </div>
    </div>
  );
}
