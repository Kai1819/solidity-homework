"use client";

import { useTx } from "@/hooks/useTx";
import { useAuctionContract } from "@/hooks/useAuctionContract";

/** 结束拍卖按钮（任何人可调，需已到期且有出价） */
export default function EndAuctionButton({
  auctionId,
  disabled = false,
  onDone,
}: {
  auctionId: bigint;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const { getSignerContract } = useAuctionContract();
  const { run, sending } = useTx();

  const handleEnd = async () => {
    const contract = getSignerContract();
    if (!contract) return;
    await run(
      async () => {
        const tx = await contract.end(auctionId);
        await tx.wait();
        return tx;
      },
      {
        successMsg: `拍卖 #${auctionId.toString()} 已结算`,
        onSuccess: () => onDone?.(),
      },
    );
  };

  return (
    <button
      onClick={handleEnd}
      disabled={disabled || sending}
      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 transition-colors disabled:opacity-50"
    >
      {sending ? "结算中…" : "结束拍卖"}
    </button>
  );
}
