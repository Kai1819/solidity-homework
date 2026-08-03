"use client";

import { useEffect, useState } from "react";
import { formatDistanceStrict } from "date-fns";
import { zhCN } from "date-fns/locale";

/** 距结束倒计时；>1 天显示日期。SSR 安全：首帧不渲染时间避免 hydration mismatch。 */
export default function CountdownTimer({ endTime }: { endTime: bigint }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // SSR 与客户端首帧一致（不渲染时间），mount 后显示倒计时
  if (now === null) {
    return <span className="font-mono text-slate-400">—</span>;
  }

  const endMs = Number(endTime) * 1000;
  const diff = endMs - now;

  if (diff <= 0) {
    return <span className="font-mono text-slate-500">已到期</span>;
  }

  if (diff > 24 * 3600 * 1000) {
    return (
      <span className="font-mono text-slate-600">
        {formatDistanceStrict(new Date(now), new Date(endMs), {
          addSuffix: true,
          locale: zhCN,
        })}
      </span>
    );
  }

  const s = Math.floor(diff / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="font-mono tabular-nums text-sky-700">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}
    </span>
  );
}
