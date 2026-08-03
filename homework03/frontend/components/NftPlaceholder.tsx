"use client";

import { useEffect, useState } from "react";
import { Image as ImageIcon } from "lucide-react";
import { ethers } from "ethers";
import { useWeb3 } from "./Web3Provider";
import { MetaNFTABI } from "@/lib/abis";

interface NftPlaceholderProps {
  nftId: bigint | string;
  size?: "sm" | "md" | "lg";
  /**
   * NFT 合约地址。提供后会异步调用 `tokenURI(id)` → 解析 metadata JSON → 加载 image。
   * 不提供或 tokenURI 为空 / 解析失败时，仍显示渐变占位图（兼容 homework03 中老 NFT tokenURI=""）。
   */
  nftAddress?: string;
}

/** 无 tokenURI 或图片加载失败时的柔和渐变占位图；
 *  若提供了 nftAddress 且 tokenURI 指向有效 metadata，则异步展示真实图片。 */
export default function NftPlaceholder({ nftId, size = "md", nftAddress }: NftPlaceholderProps) {
  const sizeCls = size === "sm" ? "h-16" : size === "lg" ? "h-56" : "h-40";
  const { imageUrl, loading } = useNftImage(nftAddress, nftId);

  return (
    <div
      className={`${sizeCls} w-full flex flex-col items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 via-indigo-50 to-purple-100 text-indigo-400 overflow-hidden`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={`MNFT #${nftId.toString()}`}
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <>
          <ImageIcon size={size === "sm" ? 18 : 32} className="mb-1" />
          <span
            className={`font-mono font-semibold text-indigo-500 ${
              size === "sm" ? "text-xs" : "text-sm"
            }`}
          >
            MNFT #{nftId.toString()}
          </span>
          {loading && size !== "sm" && (
            <span className="mt-0.5 text-[10px] text-slate-400">加载图片…</span>
          )}
        </>
      )}
    </div>
  );
}

/** 解析 tokenURI → metadata.image，转换为浏览器可加载的 https URL */
function useNftImage(
  nftAddress: string | undefined,
  tokenId: bigint | string | null | undefined,
) {
  const { provider } = useWeb3();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!provider || !nftAddress || tokenId === null || tokenId === undefined) {
      setImageUrl(null);
      return;
    }
    setImageUrl(null);
    setLoading(true);
    (async () => {
      try {
        const contract = new ethers.Contract(nftAddress, MetaNFTABI as any, provider);
        let uri = "";
        try {
          uri = (await contract.tokenURI(tokenId)) as string;
        } catch {
          if (!cancelled) setLoading(false);
          return;
        }
        if (!uri) {
          if (!cancelled) setLoading(false);
          return;
        }
        const metaUrl = resolveMetadataUrl(uri);
        if (!metaUrl) {
          if (!cancelled) setLoading(false);
          return;
        }
        const resp = await fetch(metaUrl);
        if (!resp.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const meta = await resp.json();
        const imageRaw: string = (meta.image as string) || (meta.image_url as string) || "";
        if (!imageRaw) {
          if (!cancelled) setLoading(false);
          return;
        }
        const finalUrl = resolveImageUrl(imageRaw);
        if (cancelled) return;
        setImageUrl(finalUrl);
      } catch {
        // 任何错误（网络/CORS/JSON 解析）均 fallback 占位图
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [provider, nftAddress, tokenId]);

  return { imageUrl, loading };
}

function resolveMetadataUrl(uri: string): string | null {
  if (uri.startsWith("ipfs://")) {
    const cid = uri.replace(/^ipfs:\/\/(ipfs\/)?/, "");
    return `https://ipfs.io/ipfs/${cid}`;
  }
  if (uri.startsWith("ar://")) {
    return `https://arweave.net/${uri.slice(4)}`;
  }
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return uri;
  }
  return null;
}

function resolveImageUrl(image: string): string | null {
  if (image.startsWith("ipfs://")) {
    const cid = image.replace(/^ipfs:\/\/(ipfs\/)?/, "");
    return `https://ipfs.io/ipfs/${cid}`;
  }
  if (image.startsWith("ar://")) {
    return `https://arweave.net/${image.slice(4)}`;
  }
  if (image.startsWith("data:")) {
    return image;
  }
  if (image.startsWith("http://") || image.startsWith("https://")) {
    return image;
  }
  return null;
}