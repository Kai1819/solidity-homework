"use client";

import { useEffect, useMemo, useState } from "react";
import { parseEther, parseUnits, MaxUint256 } from "ethers";
import { useWeb3 } from "./Web3Provider";
import { useTx } from "@/hooks/useTx";
import { useAuctionContract } from "@/hooks/useAuctionContract";
import { useUSDC } from "@/hooks/useMetaNFT";
import { useBalances } from "@/hooks/useBalances";
import { formatUsd } from "@/lib/format";
import { ZERO_ADDRESS, USDC_DECIMALS } from "@/lib/constants";
import { getAuctionAddress } from "@/lib/config";
import type { AuctionView, TokenPrices } from "@/types";

type Mode = "eth" | "usdc";

interface BidModalProps {
  auction: AuctionView;
  prices: TokenPrices;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function BidModal({ auction, prices, open, onClose, onSuccess }: BidModalProps) {
  const { account, connectWallet } = useWeb3();
  const { getSignerContract } = useAuctionContract();
  const { run } = useTx();
  const usdc = useUSDC();
  const balances = useBalances();

  const [mode, setMode] = useState<Mode>("eth");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<"input" | "approve" | "confirm">("input");
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setStep("input");
      setMode("eth");
      usdc.refresh();
      balances.refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const minUsd = useMemo(() => {
    const base = auction.startingPriceInDollar > auction.highestBidInDollar
      ? auction.startingPriceInDollar
      : auction.highestBidInDollar;
    return base;
  }, [auction]);

  const parseAmount = (): bigint => {
    if (!amount) return 0n;
    try {
      return mode === "eth" ? parseEther(amount) : parseUnits(amount, USDC_DECIMALS);
    } catch {
      return 0n;
    }
  };

  const amountRaw = parseAmount();

  /** 估算出价折美元（×1e8） */
  const estimatedUsd = useMemo(() => {
    if (amountRaw === 0n) return null;
    const price = mode === "eth" ? prices.eth : prices.usdc;
    if (price === null) return null;
    const decimals = mode === "eth" ? 18 : USDC_DECIMALS;
    return (amountRaw * price) / 10n ** BigInt(decimals);
  }, [amountRaw, mode, prices]);

  const validations = useMemo(() => {
    const list: { ok: boolean; msg: string }[] = [];
    if (!amount || amountRaw <= 0n) {
      list.push({ ok: false, msg: "请输入有效金额" });
    } else {
      if (mode === "eth" && balances.ethRaw !== null && amountRaw > balances.ethRaw) {
        list.push({ ok: false, msg: "ETH 余额不足" });
      }
      if (mode === "usdc" && usdc.balance !== null && amountRaw > usdc.balance) {
        list.push({ ok: false, msg: "USDC 余额不足" });
      }
      if (estimatedUsd !== null && estimatedUsd <= minUsd) {
        list.push({
          ok: false,
          msg: `出价需高于 ${formatUsd(minUsd)}，当前约 ${formatUsd(estimatedUsd)}`,
        });
      }
      // 按当前出价模式检查对应价格源是否配置
      if ((mode === "eth" && prices.eth === null) || (mode === "usdc" && prices.usdc === null)) {
        list.push({ ok: false, msg: "价格源未配置，无法出价" });
      }
    }
    return list;
  }, [amount, amountRaw, mode, balances.ethRaw, usdc.balance, estimatedUsd, minUsd, prices]);

  // USDC 出价时：allowance 未加载（null）视为需授权；已加载且不足也需授权
  const needsApprove =
    mode === "usdc" && (usdc.allowance === null || usdc.allowance < amountRaw);

  if (!open) return null;

  const handleApprove = async () => {
    setApproving(true);
    const result = await usdc.approve(getAuctionAddress(), MaxUint256);
    setApproving(false);
    if (result) {
      await usdc.refresh();
      setStep("confirm");
    }
  };

  const handleBid = async () => {
    const contract = getSignerContract();
    if (!contract) return;
    await run(
      async () => {
        const overrides = mode === "eth" ? { value: amountRaw } : {};
        const tx = await contract.bid(auction.id, amountRaw, overrides);
        await tx.wait();
        return tx;
      },
      { onSuccess },
    );
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-800">
          出价竞拍 · 拍卖 #{auction.id.toString()}
        </h2>

        {/* 模式切换 */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
          {(["eth", "usdc"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setStep("input");
              }}
              className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"
              }`}
            >
              {m === "eth" ? "ETH 出价" : "USDC 出价"}
            </button>
          ))}
        </div>

        {/* 金额输入 */}
        <div className="mt-4">
          <label className="text-xs text-slate-500">出价金额（{mode.toUpperCase()}）</label>
          <input
            type="number"
            step={mode === "eth" ? "0.001" : "1"}
            min="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setStep("input");
            }}
            placeholder={mode === "eth" ? "0.1" : "100"}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 font-mono text-lg focus:border-sky-400 focus:outline-none"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            {estimatedUsd !== null
              ? `预计折合 ${formatUsd(estimatedUsd)}（需高于 ${formatUsd(minUsd)}）`
              : "价格源未配置，无法估算美元价值"}
          </p>
          {mode === "eth" && balances.eth !== null && (
            <p className="mt-0.5 text-xs text-slate-400">可用余额：{balances.eth} ETH</p>
          )}
          {mode === "usdc" && usdc.balance !== null && (
            <p className="mt-0.5 text-xs text-slate-400">
              可用余额：{(Number(usdc.balance) / 10 ** USDC_DECIMALS).toFixed(2)} USDC
            </p>
          )}
        </div>

        {/* 校验提示 */}
        {validations.length > 0 && (
          <ul className="mt-3 space-y-1">
            {validations.map((v, i) => (
              <li key={i} className="text-xs text-red-500">
                {v.msg}
              </li>
            ))}
          </ul>
        )}

        {/* 操作按钮 */}
        <div className="mt-5 space-y-2">
          {!account ? (
            <button
              onClick={connectWallet}
              className="w-full rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-medium text-white"
            >
              连接钱包
            </button>
          ) : step === "approve" || (mode === "usdc" && needsApprove && step === "input") ? (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="w-full rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              {approving ? "授权中…" : "第 1 步：授权 USDC"}
            </button>
          ) : (
            <button
              onClick={step === "confirm" || mode === "eth" ? handleBid : () => setStep("approve")}
              disabled={validations.some((v) => !v.ok) || (mode === "usdc" && needsApprove)}
              className="w-full rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {mode === "usdc" && needsApprove ? "授权后出价" : "确认出价"}
            </button>
          )}
        </div>

        {mode === "eth" && (
          <p className="mt-3 text-xs text-slate-400">
            说明：ETH 出价时发送的 ETH 金额与出价金额一致（合约要求 amount == msg.value）。
          </p>
        )}
        {mode === "usdc" && (
          <p className="mt-3 text-xs text-slate-400">
            说明：USDC 出价需先授权拍卖合约，超价后退款将原路退回 USDC。
          </p>
        )}
      </div>
    </div>
  );
}
