"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Copy, Loader2, Rocket, ShieldCheck } from "lucide-react";
import { useSetup } from "@/hooks/useSetup";
import { useWeb3 } from "./Web3Provider";
import { useAdmin } from "@/hooks/useAdmin";
import { useAuctionContract } from "@/hooks/useAuctionContract";
import { useAlert } from "./AlertProvider";
import { ZERO_ADDRESS } from "@/lib/constants";

const STEPS = ["部署 MetaNFT", "部署 USDC", "部署 Oracle", "配置价格源", "保存配置"];

/** 初始化向导：admin 一键部署辅助合约并配置 oracle */
export default function SetupWizard({ onDone }: { onDone?: () => void }) {
  const { account, connectWallet, signer } = useWeb3();
  const { getSignerContract } = useAuctionContract();
  const { isAdmin } = useAdmin(account ? getSignerContract() : null);
  const { state, deploying, deployAll, configureOracles, saveLocal, refreshStatus } = useSetup();
  const { showInfo, showSuccess } = useAlert();
  const [currentStep, setCurrentStep] = useState(-1); // -1 未开始
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // 每次 state 地址或 provider/refreshStatus 变化时，用 state 真实地址重新检查链上 code
    refreshStatus({
      metaNFT: state.metaNFT,
      usdc: state.usdc,
      oracle: state.oracle,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshStatus, state.metaNFT, state.usdc, state.oracle]);

  // 已有配置时自动跳到对应步骤
  useEffect(() => {
    if (state.exists.metaNFT && state.exists.usdc && state.exists.oracle) {
      setCurrentStep((s) => (s < 3 ? 3 : s));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.exists]);

  const handleDeployAll = async () => {
    if (!signer) return;
    const addresses = await deployAll();
    if (addresses) {
      setCurrentStep(3);
      showSuccess("三个辅助合约部署完成，正在配置价格源…", "部署成功");
      await configureOracles();
      await refreshStatus();
      setCurrentStep(4);
      showSuccess("配置已保存到浏览器本地，刷新后仍生效", "初始化完成");
      onDone?.();
    }
  };

  const handleConfigureOracles = async () => {
    const result = await configureOracles();
    if (result) {
      setCurrentStep(4);
      showSuccess("价格源配置完成", "完成");
      onDone?.();
    }
  };

  const copyEnv = async () => {
    const block = `# 追加到 frontend/.env.local
NEXT_PUBLIC_META_NFT_ADDRESS=${state.metaNFT}
NEXT_PUBLIC_USDC_ADDRESS=${state.usdc}
NEXT_PUBLIC_ORACLE_ADDRESS=${state.oracle}`;
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  if (!account) {
    return (
      <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-8 text-center">
        <p className="text-slate-600">请先连接钱包（管理员账户）</p>
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
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center">
        <p className="text-amber-700">仅管理员可执行初始化操作</p>
        <p className="mt-1 text-sm text-amber-600">
          当前账户非管理员（ProxyAdmin.owner()），请联系管理员操作。
        </p>
        <Link href="/" className="mt-4 inline-block text-sky-600 hover:underline">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 步骤条 */}
      <div className="flex items-center justify-between">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold ${
                i <= currentStep
                  ? "bg-gradient-to-r from-sky-500 to-indigo-500 text-white"
                  : "bg-slate-200 text-slate-500"
              }`}
            >
              {i < currentStep ? <Check size={14} /> : i + 1}
            </div>
            <span className="text-[10px] text-slate-500">{label}</span>
          </div>
        ))}
      </div>

      {/* 当前状态 */}
      <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-6">
        <h3 className="flex items-center gap-2 font-semibold text-slate-800">
          <ShieldCheck size={16} className="text-sky-600" />
          辅助合约状态
        </h3>
        <div className="mt-4 space-y-2 text-sm">
          {[
            ["MetaNFT", state.metaNFT, state.exists.metaNFT],
            ["USDC (MockERC20)", state.usdc, state.exists.usdc],
            ["Oracle (MockOracle)", state.oracle, state.exists.oracle],
          ].map(([label, addr, ok]) => (
            <div key={label as string} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span className="text-slate-600">{label}</span>
              <span className="flex items-center gap-2">
                {addr ? (
                  <>
                    <span className="font-mono text-xs text-slate-500">
                      {(addr as string).slice(0, 10)}…{(addr as string).slice(-6)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {ok ? "链上存在" : "未部署"}
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">未配置</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 操作区 */}
      <div className="rounded-2xl border border-slate-200/60 bg-white/70 p-6">
        {currentStep < 3 && (
          <>
            <p className="text-sm text-slate-600">
              一键部署 <b>MetaNFT</b>、<b>USDC (MockERC20, 6 位小数)</b> 与{" "}
              <b>Oracle (MockOracle, 初始 ETH=$2000)</b>，随后自动为 ETH 与 USDC 配置价格源。
              部署费用由当前管理员钱包支付（Sepolia ETH）。
            </p>
            <button
              onClick={handleDeployAll}
              disabled={deploying || !signer}
              className="mt-4 flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 px-6 py-3 font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60"
            >
              {deploying ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> 部署中…（需确认 3 笔交易）
                </>
              ) : (
                <>
                  <Rocket size={16} /> 一键部署全部辅助合约
                </>
              )}
            </button>
          </>
        )}

        {currentStep === 3 && (
          <div>
            <p className="text-sm text-slate-600">
              为拍卖合约配置价格源（ETH → 使用地址 0x000…0 作为 key；USDC → 使用配置地址）。
            </p>
            <div className="mt-3 space-y-1 text-xs text-slate-500">
              <p>ETH oracle: {state.oracleConfigured.eth ? "已配置 ✓" : "未配置"}</p>
              <p>USDC oracle: {state.oracleConfigured.usdc ? "已配置 ✓" : "未配置"}</p>
            </div>
            <button
              onClick={handleConfigureOracles}
              className="mt-4 rounded-xl bg-slate-800 px-6 py-3 font-medium text-white hover:bg-slate-700 transition-colors"
            >
              配置价格源
            </button>
          </div>
        )}

        {currentStep >= 4 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              ✅ 初始化完成！配置已保存到浏览器本地，刷新后仍生效。
            </div>
            <div>
              <p className="mb-2 text-xs text-slate-500">
                建议将地址复制到 <code className="rounded bg-slate-100 px-1">.env.local</code>{" "}
                以便跨浏览器持久化：
              </p>
              <pre className="overflow-x-auto rounded-xl bg-slate-800 p-4 font-mono text-xs text-slate-100">
                {`NEXT_PUBLIC_META_NFT_ADDRESS=${state.metaNFT}\nNEXT_PUBLIC_USDC_ADDRESS=${state.usdc}\nNEXT_PUBLIC_ORACLE_ADDRESS=${state.oracle}`}
              </pre>
              <button
                onClick={copyEnv}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200/70"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "已复制" : "复制配置"}
              </button>
            </div>
            <div className="flex gap-2">
              <Link
                href="/"
                className="rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-2.5 text-sm font-medium text-white"
              >
                返回首页
              </Link>
              <Link
                href="/admin"
                className="rounded-lg bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200/70"
              >
                前往管理面板启动拍卖
              </Link>
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400">
        提示：辅助合约未部署到 Sepolia，本向导提供浏览器内一键部署（需管理员钱包）。
        ETH 在合约中用 0x000…0 表示；Oracle 价格为 8 位小数美元。
      </p>
    </div>
  );
}
