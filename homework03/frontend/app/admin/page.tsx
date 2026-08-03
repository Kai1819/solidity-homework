"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert, AlertTriangle } from "lucide-react";
import { useWeb3 } from "@/components/Web3Provider";
import { useAuctionContract } from "@/hooks/useAuctionContract";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuctions } from "@/hooks/useAuctions";
import { useAuxContracts } from "@/hooks/useAuxContracts";
import { useSetup } from "@/hooks/useSetup";
import { useLocalAuxAddresses } from "@/hooks/useLocalAuxAddresses";
import AdminPanel from "@/components/AdminPanel";
import { isAuxConfigured } from "@/lib/config";
import { shortAddress } from "@/lib/format";

export default function AdminPage() {
  const { account, connectWallet } = useWeb3();
  const { getSignerContract } = useAuctionContract();
  const { isAdmin, adminAddress, refreshAdmin } = useAdmin(account ? getSignerContract() : null);
  const { auctions, refresh } = useAuctions();
  const { state, refreshStatus } = useSetup();
  const { getMetaNFTAddress, getUsdcAddress, getOracleAddress } = useAuxContracts();
  const localAux = useLocalAuxAddresses();
  const [oracleState, setOracleState] = useState<{ eth: string; usdc: string } | undefined>();

  const envAuxReady = isAuxConfigured();
  const auxReady = envAuxReady || Boolean(localAux);

  useEffect(() => {
    refreshAdmin();
    refreshStatus({
      metaNFT: state.metaNFT,
      usdc: state.usdc,
      oracle: state.oracle,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, state.metaNFT, state.usdc, state.oracle]);

  useEffect(() => {
    if (auxReady) {
      setOracleState({
        eth: state.oracleConfigured.eth ? getOracleAddress() : "",
        usdc: state.oracleConfigured.usdc ? getOracleAddress() : "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, auxReady]);

  if (!account) {
    return (
      <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-10 text-center">
        <p className="text-slate-600">请先连接钱包</p>
        <button
          onClick={connectWallet}
          className="mt-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-2.5 text-sm font-medium text-white"
        >
          连接钱包
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-10 text-center">
        <ShieldAlert className="mx-auto text-amber-500" size={32} />
        <p className="mt-3 font-medium text-amber-700">仅管理员可访问</p>
        <p className="mt-1 text-sm text-amber-600">
          管理员地址：<span className="font-mono">{shortAddress(adminAddress)}</span>，当前账户非管理员。
        </p>
        <Link href="/" className="mt-4 inline-block text-sky-600 hover:underline">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} className="text-sky-600" />
        <h1 className="text-2xl font-bold text-slate-800">管理员面板</h1>
        <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
          管理员已确认
        </span>
      </div>

      {!auxReady && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <AlertTriangle size={16} />
          辅助合约未配置（MetaNFT/USDC/Oracle）
          <Link
            href="/setup"
            className="ml-auto shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
          >
            前往初始化
          </Link>
        </div>
      )}

      <AdminPanel
        auctions={auctions}
        onRefresh={() => {
          refresh();
          refreshStatus();
        }}
        oracleState={oracleState}
        onOracleChanged={() => {
          setOracleState({
            eth: state.oracleConfigured.eth ? getOracleAddress() : "",
            usdc: state.oracleConfigured.usdc ? getOracleAddress() : "",
          });
        }}
      />

      <p className="text-xs text-slate-400">
        已配置：MetaNFT {getMetaNFTAddress() ? shortAddress(getMetaNFTAddress()) : "—"} · USDC{" "}
        {getUsdcAddress() ? shortAddress(getUsdcAddress()) : "—"} · Oracle{" "}
        {getOracleAddress() ? shortAddress(getOracleAddress()) : "—"}
      </p>
    </div>
  );
}
