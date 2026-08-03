"use client";

import { Settings } from "lucide-react";
import SetupWizard from "@/components/SetupWizard";

export default function SetupPage() {
  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex items-center gap-2">
        <Settings size={20} className="text-sky-600" />
        <h1 className="text-2xl font-bold text-slate-800">初始化向导</h1>
      </div>
      <p className="text-sm text-slate-500">
        部署 MetaNFT / USDC / Oracle 三个辅助合约（当前均未部署在 Sepolia），并配置价格源。
        仅管理员（0x4E28…FE75）可操作。
      </p>
      <SetupWizard />
    </div>
  );
}
