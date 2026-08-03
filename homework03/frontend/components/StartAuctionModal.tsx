"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWeb3 } from "./Web3Provider";
import { useAdmin } from "@/hooks/useAdmin";
import { useMetaNFT } from "@/hooks/useMetaNFT";
import { useAuctionContract } from "@/hooks/useAuctionContract";
import { useAuxContracts } from "@/hooks/useAuxContracts";
import { useAlert } from "./AlertProvider";
import { ZERO_ADDRESS } from "@/lib/constants";

interface StartAuctionModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/** 启动拍卖（两步：卖家授权 → 提交 start）
 *  homework03 适配：自动探测 seller 实际持有的 NFT ID（下拉选择），
 *  避免输入不存在的 nftId 触发 OZ v5 ERC721IncorrectOwner。
 *
 *  探测策略（纯 view call，浏览器端稳定）：
 *    1) balanceOf(seller) == 0 → 直接返回空（< 1s）
 *    2) 并发枚举 ownerOf(1..MAX_SCAN)；找到持有者匹配即收入（~5-10s）
 *    3) 扫描失败/无匹配 → 提示手动输入 tokenId
 *
 *  早期版本用 chunkedGetLogs 从 block 0 扫整个 Sepolia，会因 MetaMask 走 Infura
 *  的 eth_getLogs rate-limit 一直卡在"扫描中"；此处弃用。
 */
const MAX_SCAN = 100;

export default function StartAuctionModal({ open, onClose, onSuccess }: StartAuctionModalProps) {
  const { account, provider } = useWeb3();
  const { getSignerContract } = useAuctionContract();
  const { start, sending } = useAdmin(open ? getSignerContract() : null);
  const metaNFT = useMetaNFT();
  const { getMetaNFTAddress, getMetaNFTContract, getUsdcAddress } = useAuxContracts();
  const { showInfo } = useAlert();

  const [seller, setSeller] = useState("");
  const [nftAddress, setNftAddress] = useState("");
  const [nftId, setNftId] = useState<string>(""); // 改为选择列表（从 sellerNfts 里选）
  const [sellerNfts, setSellerNfts] = useState<bigint[] | null>(null); // null=扫描中
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState(false); // 探测失败时手动输入 tokenId
  const [startingPrice, setStartingPrice] = useState("1000");
  const [duration, setDuration] = useState("3600");
  const [paymentToken, setPaymentToken] = useState("eth"); // eth | usdc | custom
  const [customToken, setCustomToken] = useState("");
  const [approved, setApproved] = useState(false);
  const [checkingApproval, setCheckingApproval] = useState(false);

  // 防止 seller/nftAddress 连续变化时旧扫描结果覆盖新结果
  const scanIdRef = useRef(0);

  // 用 balanceOf + 并发 ownerOf 探测 seller 持有的 NFT ID
  const scanSellerNfts = useCallback(async () => {
    if (!open) return;
    const sellerAddr = seller.trim();
    const contract = getMetaNFTContract();
    const nftAddr = nftAddress.trim() || getMetaNFTAddress();
    if (!provider || !sellerAddr || !contract || !nftAddr) {
      setSellerNfts([]);
      setScanErr(null);
      return;
    }
    const myScanId = ++scanIdRef.current;
    setSellerNfts(null);
    setScanErr(null);
    setManualInput(false);
    try {
      const bal = (await contract.balanceOf(sellerAddr)) as bigint;
      if (bal === 0n) {
        if (myScanId !== scanIdRef.current) return;
        setSellerNfts([]);
        return;
      }
      // 并发枚举 ownerOf(1..MAX_SCAN)；MetaNFT 自增 id，无 ERC721Enumerable 退路
      const ids = Array.from({ length: MAX_SCAN }, (_, i) => BigInt(i + 1));
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const owner = (await contract.ownerOf(id)) as string;
            return { id, owner: owner.toLowerCase() };
          } catch {
            return null; // 不存在/已销毁
          }
        }),
      );
      if (myScanId !== scanIdRef.current) return;
      const me = sellerAddr.toLowerCase();
      const found = results
        .filter((r): r is { id: bigint; owner: string } => !!r && r.owner === me)
        .map((r) => r.id)
        .sort((a, b) => (a < b ? -1 : 1));
      if (found.length === 0) {
        setScanErr(
          `卖家持有 ${bal.toString()} 个 NFT，但 1..${MAX_SCAN} 范围内未找到（tokenId 可能较大），请切换到手动输入`,
        );
        setSellerNfts([]);
        setManualInput(true);
        return;
      }
      setSellerNfts(found);
      setNftId(found[0].toString());
    } catch (e: any) {
      console.error("scanSellerNfts:", e);
      if (myScanId !== scanIdRef.current) return;
      setScanErr(e?.shortMessage || e?.reason || e?.message || "探测失败");
      setSellerNfts([]);
      setManualInput(true);
    }
  }, [open, provider, seller, nftAddress, getMetaNFTContract, getMetaNFTAddress]);

  // 打开 modal 或 seller/nftAddress 变化时，重新探测
  useEffect(() => {
    if (open) {
      setSeller(account || "");
      setNftAddress(getMetaNFTAddress());
      setApproved(false);
      setSellerNfts(null);
      setNftId("");
      setScanErr(null);
      setManualInput(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // seller / nftAddress 确定后触发扫描（受 scanIdRef 竞态保护）
  useEffect(() => {
    scanSellerNfts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seller, nftAddress, open]);

  const checkApproval = async () => {
    if (!seller || !nftAddress) {
      showInfo("请填写卖家地址与 NFT 合约地址");
      return;
    }
    setCheckingApproval(true);
    try {
      const ok = await metaNFT.isApprovedForAll(seller);
      setApproved(ok);
      showInfo(
        ok
          ? "卖家已授权拍卖合约使用 NFT ✓"
          : "卖家尚未授权，请使用卖家账户点击「授权 NFT」",
      );
    } finally {
      setCheckingApproval(false);
    }
  };

  const resolvePaymentToken = (): string => {
    if (paymentToken === "eth") return ZERO_ADDRESS;
    if (paymentToken === "usdc") return getUsdcAddress() || "";
    return customToken;
  };

  const noNft = !manualInput && sellerNfts !== null && sellerNfts.length === 0;

  const handleSubmit = async () => {
    let price: bigint, dur: bigint, id: bigint;
    try {
      price = BigInt(startingPrice || "0");
      dur = BigInt(duration || "0");
      id = BigInt(nftId || "0");
    } catch {
      showInfo("起拍价、时长、NFT ID 必须是正整数（不支持小数）");
      return;
    }
    const token = resolvePaymentToken();
    if (!seller || !nftAddress || price <= 0n) {
      showInfo("请填写完整的表单（起拍价为整数美元）");
      return;
    }
    if (dur < 30n) {
      showInfo("拍卖时长至少 30 秒");
      return;
    }
    if (!token) {
      showInfo("支付代币无效");
      return;
    }
    if (!approved) {
      showInfo("请先确认卖家已授权 NFT");
      return;
    }
    if (!nftId) {
      showInfo("请从列表中选择要拍卖的 NFT ID");
      return;
    }
    const result = await start(seller, id, nftAddress, price, dur, token);
    if (result) {
      onSuccess();
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/30 p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl animate-scale-in max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-slate-800">启动拍卖</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-slate-500">卖家地址</label>
            <input
              value={seller}
              onChange={(e) => setSeller(e.target.value)}
              placeholder="0x…"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500">NFT 合约地址</label>
            <input
              value={nftAddress}
              onChange={(e) => setNftAddress(e.target.value)}
              placeholder="MetaNFT 地址"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"
            />
          </div>

          {/* NFT 选择：扫描 seller 实际持有的 ID（避免输入不存在的 id） */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-500">
                NFT ID（仅展示卖家实际持有的）
              </label>
              <button
                type="button"
                onClick={scanSellerNfts}
                disabled={sellerNfts === null}
                className="text-[11px] text-slate-500 hover:text-sky-600 transition-colors disabled:opacity-50"
              >
                刷新
              </button>
            </div>
            {sellerNfts === null ? (
              <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                正在探测 seller 持有的 NFT…
              </p>
            ) : manualInput ? (
              <>
                {scanErr && (
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    {scanErr}
                  </p>
                )}
                <input
                  type="number"
                  min="1"
                  value={nftId}
                  onChange={(e) => setNftId(e.target.value)}
                  placeholder="手动输入 seller 持有的 NFT ID"
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"
                />
              </>
            ) : sellerNfts.length === 0 ? (
              <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                该卖家未持有 NFT。请先在首页「铸造 NFT」铸造一个（或从其他账户转入 NFT 到本地址）后再启动拍卖。
              </p>
            ) : (
              <select
                value={nftId}
                onChange={(e) => setNftId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"
              >
                {sellerNfts.map((id) => (
                  <option key={id.toString()} value={id.toString()}>
                    MNFT #{id.toString()}
                  </option>
                ))}
              </select>
            )}
            {sellerNfts !== null && sellerNfts.length > 0 && (
              <button
                type="button"
                onClick={() => setManualInput((v) => !v)}
                className="mt-1 text-[11px] text-slate-500 hover:text-sky-600 transition-colors"
              >
                {manualInput ? "切回自动选择" : "切到手动输入"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">起拍价（整数美元）</label>
              <input
                type="number"
                min="1"
                value={startingPrice}
                onChange={(e) => setStartingPrice(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              />
              <p className="mt-0.5 text-[10px] text-slate-400">合约内部 ×1e8，不支持小数</p>
            </div>
            <div>
              <label className="text-xs text-slate-500">时长（秒，≥30）</label>
              <input
                type="number"
                min="30"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500">支付代币</label>
            <select
              value={paymentToken}
              onChange={(e) => setPaymentToken(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-400 focus:outline-none"
            >
              <option value="eth">ETH</option>
              <option value="usdc">USDC</option>
              <option value="custom">自定义地址</option>
            </select>
          </div>

          {paymentToken === "custom" && (
            <div>
              <label className="text-xs text-slate-500">自定义代币地址</label>
              <input
                value={customToken}
                onChange={(e) => setCustomToken(e.target.value)}
                placeholder="0x…"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm focus:border-sky-400 focus:outline-none"
              />
            </div>
          )}

          {/* 卖家授权（Step 1） */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-medium text-slate-600">
              Step 1 · 卖家授权拍卖合约（setApprovalForAll）
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={checkApproval}
                disabled={checkingApproval}
                className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200/70 disabled:opacity-50"
              >
                {checkingApproval ? "检查中…" : "检查授权状态"}
              </button>
              {seller === account && !approved && (
                <button
                  onClick={async () => {
                    const r = await metaNFT.setApprovalForAll(true);
                    if (r) {
                      setApproved(true);
                    }
                  }}
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                >
                  授权 NFT（需卖家钱包确认）
                </button>
              )}
            </div>
            <p className={`mt-2 text-xs ${approved ? "text-emerald-600" : "text-amber-600"}`}>
              {approved ? "✓ 已授权，可提交启动" : "未授权 — 启动时会因 transferFrom 失败而 revert"}
            </p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={handleSubmit}
            disabled={sending || noNft || !nftId}
            className="flex-1 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            title={noNft ? "卖家未持有 NFT，无法启动拍卖" : undefined}
          >
            {sending ? "启动中…" : "启动拍卖（Step 2）"}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-200/70"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}