"use client";

import type { AuctionStatus } from "@/types";
import { STATUS_LABEL } from "@/lib/format";

const STYLES: Record<AuctionStatus, string> = {
  "not-started": "bg-slate-100 text-slate-600 border-slate-200",
  active: "bg-sky-100 text-sky-700 border-sky-200",
  "ended-with-bid": "bg-slate-100 text-slate-600 border-slate-200",
  "ended-no-bid": "bg-amber-100 text-amber-700 border-amber-200",
};

export default function AuctionStatusBadge({ status }: { status: AuctionStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
