"use client";

import { useState } from "react";
import { useMetaNFT } from "@/hooks/useMetaNFT";
import { useWeb3 } from "./Web3Provider";
import { useAlert } from "./AlertProvider";

/**
 * NFT 铸造面板（homework03 适配）：
 *  - MetaNFT.mint 为 onlyOwner 且 tokenId 合约内自增，
 *    因此「一键铸造」调用 mintTokenURI("") 自动分配 id；
 *  - 移除了 hardhatV3Nft 的「指定 id 铸造」（合约不支持指定 id），
 *    改为可选的「指定 tokenURI」铸造；
 *  - 非 owner（非管理员）账户仅提示，不提供铸造按钮。
 */
export default function MintPanel({ onDone }: { onDone?: () => void }) {
  const { account } = useWeb3();
  const { notConfigured, mintTokenURI, balance, isOwner, refresh } = useMetaNFT();
  const { showInfo } = useAlert();
  const [sendingNext, setSendingNext] = useState(false);
  const [customUri, setCustomUri] = useState("");
  const [sendingCustom, setSendingCustom] = useState(false);

  if (notConfigured) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        尚未配置 MetaNFT 合约，请先前往「初始化向导」部署。
      </div>
    );
  }

  // homework03 的 MetaNFT.mint 仅 owner（部署账户/管理员）可调用
  if (!isOwner) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        homework03 的 MetaNFT.mint 为 onlyOwner，仅合约 owner（管理员 0x4E28…FE75）
        可以铸造新 NFT。当前账户非 owner，如需测试请切换管理员账户。
      </div>
    );
  }

  const handleMintNext = async () => {
    setSendingNext(true);
    const result = await mintTokenURI("");
    setSendingNext(false);
    if (result) {
      await refresh();
      const idText = result.tokenId !== null ? ` #${result.tokenId.toString()}` : "";
      showInfo(`NFT${idText} 已铸造，可在「我的资产」中查看`, "铸造成功");
      onDone?.();
    }
  };

  const handleMintCustom = async () => {
    if (!account) {
      showInfo("请先连接钱包");
      return;
    }
    setSendingCustom(true);
    const result = await mintTokenURI(customUri.trim());
    setSendingCustom(false);
    if (result) {
      await refresh();
      const idText = result.tokenId !== null ? ` #${result.tokenId.toString()}` : "";
      showInfo(`NFT${idText} 铸造成功`, "铸造成功");
      setCustomUri("");
      onDone?.();
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
        <span className="text-slate-500">我的 NFT 数量</span>
        <span className="font-mono font-semibold text-slate-800">
          {balance !== null ? balance.toString() : "—"}
        </span>
      </div>

      <button
        onClick={handleMintNext}
        disabled={sendingNext}
        className="w-full rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {sendingNext ? "铸造中…" : "一键铸造下一个 NFT（mint，自动分配 ID）"}
      </button>

      <div className="flex gap-2">
        <input
          value={customUri}
          onChange={(e) => setCustomUri(e.target.value)}
          placeholder="可选：tokenURI（留空则无元数据）"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
        />
        <button
          onClick={handleMintCustom}
          disabled={sendingCustom}
          className="shrink-0 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200/70 transition-colors disabled:opacity-50"
        >
          {sendingCustom ? "铸造中…" : "铸造"}
        </button>
      </div>

      <p className="text-xs text-slate-400">
        提示：homework03 的 MetaNFT 支持 tokenURI，未提供时将以渐变占位图展示。
        仅合约 owner（管理员）可铸造。
      </p>
    </div>
  );
}
