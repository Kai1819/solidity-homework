"use client";

import { useState } from "react";
import { parseUnits } from "ethers";
import { useUSDC } from "@/hooks/useMetaNFT";
import { useAlert } from "./AlertProvider";
import { USDC_DECIMALS } from "@/lib/constants";

/**
 * USDC 测试币领取（MockERC20 mint，homework03 合约源码中 mint 公开，
 * 任何账户都能调用，无需权限；按钮对所有账户开放）。
 */
export default function FaucetModal({ onClose }: { onClose: () => void }) {
  const { notConfigured, faucetMint, balance, allowance, refresh } = useUSDC();
  const { showInfo } = useAlert();
  const [amount, setAmount] = useState("10000");
  const [sending, setSending] = useState(false);

  const mint = async () => {
    const parsed = parseUnits(amount || "0", USDC_DECIMALS);
    if (parsed <= 0n) {
      showInfo("请输入有效的数量");
      return;
    }
    setSending(true);
    const result = await faucetMint(parsed);
    setSending(false);
    if (result) {
      await refresh();
      showInfo("USDC 已到账，可在出价时使用", "领取成功");
      onClose();
    }
  };

  return (
    <div className="space-y-4">
      {notConfigured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          尚未配置 USDC 合约，请先前往「初始化向导」部署。
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">我的 USDC 余额</p>
              <p className="mt-0.5 font-mono font-semibold text-slate-800">
                {balance !== null ? (Number(balance) / 10 ** USDC_DECIMALS).toFixed(2) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-xs text-slate-500">对拍卖合约授权</p>
              <p className="mt-0.5 font-mono font-semibold text-slate-800">
                {allowance !== null && allowance > 0n ? "已授权 ✓" : "未授权"}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              placeholder="数量"
            />
            <button
              onClick={mint}
              disabled={sending}
              className="shrink-0 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {sending ? "领取中…" : "领取测试币"}
            </button>
          </div>
          <p className="text-xs text-slate-400">
            MockERC20.mint 公开，任何账户都可领取测试币（6 位小数）。
          </p>
        </>
      )}
    </div>
  );
}