"use client";

import { useCallback, useEffect, useState } from "react";
import { useWeb3 } from "./useWeb3";
import { useAuxContracts } from "./useAuxContracts";
import { useTx } from "./useTx";
import { getAuctionAddress } from "@/lib/config";
import { MaxUint256 } from "ethers";

/**
 * MetaNFT：铸造 / 授权 / 持有查询
 *
 * homework03 适配说明：
 *  - MetaNFT.mint(address to, string tokenURI_) 为 onlyOwner 且 tokenId 合约内自增，
 *    与 hardhatV3Nft 的公开 mint(address,uint256)/mintNext 不同；
 *    因此前端暴露 mintTokenURI(tokenURI)（owner 可铸，自动分配 id，返回 tokenId）。
 *  - 增加 isOwner 判断（查询合约 owner()），供 MintPanel 做权限提示。
 */
export function useMetaNFT() {
  const { account } = useWeb3();
  const { getMetaNFTContract, getMetaNFTAddress } = useAuxContracts();
  const { run } = useTx();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const notConfigured = !getMetaNFTAddress();

  const refresh = useCallback(async () => {
    const contract = getMetaNFTContract();
    if (!contract || !account) {
      setBalance(null);
      setIsOwner(false);
      return;
    }
    setRefreshing(true);
    try {
      const [b, owner] = await Promise.all([
        contract.balanceOf(account),
        contract.owner().catch(() => ""),
      ]);
      setBalance(b as bigint);
      setIsOwner(
        Boolean(owner) && owner.toLowerCase() === account.toLowerCase(),
      );
    } catch (e) {
      console.error("useMetaNFT refresh:", e);
    } finally {
      setRefreshing(false);
    }
  }, [getMetaNFTContract, account]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /**
   * 铸造新 NFT（仅 owner 可调）。homework03 的 mint 返回自增 tokenId，
   * 从交易日志的 ERC721 Transfer 事件（from=0x0）解析出本次铸造的 id。
   */
  const mintTokenURI = useCallback(
    async (tokenURI: string = "") => {
      const contract = getMetaNFTContract(true);
      if (!contract || !account) return null;
      return run(async () => {
        const tx = await contract.mint(account, tokenURI);
        const receipt = await tx.wait();
        // 从日志解析本次铸造的 tokenId（Transfer: from=0x0, to=account）
        let tokenId: bigint | null = null;
        try {
          for (const log of receipt?.logs ?? []) {
            const parsed = contract.interface.parseLog(log);
            if (
              parsed &&
              parsed.name === "Transfer" &&
              (parsed.args[0] as string).toLowerCase() ===
                "0x0000000000000000000000000000000000000000" &&
              (parsed.args[1] as string).toLowerCase() === account.toLowerCase()
            ) {
              tokenId = parsed.args[2] as bigint;
              break;
            }
          }
        } catch {
          // 日志解析失败不影响结果展示
        }
        return { tx, tokenId };
      }, { successMsg: "NFT 铸造成功" });
    },
    [getMetaNFTContract, account, run],
  );

  const setApprovalForAll = useCallback(
    async (approved: boolean) => {
      const contract = getMetaNFTContract(true);
      if (!contract) return null;
      return run(async () => {
        const tx = await contract.setApprovalForAll(getAuctionAddress(), approved);
        await tx.wait();
        return tx;
      }, { successMsg: approved ? "已授权拍卖合约使用您的 NFT" : "已取消授权" });
    },
    [getMetaNFTContract, run],
  );

  const isApprovedForAll = useCallback(async (owner: string): Promise<boolean> => {
    const contract = getMetaNFTContract();
    if (!contract) return false;
    return (await contract.isApprovedForAll(owner, getAuctionAddress())) as boolean;
  }, [getMetaNFTContract]);

  return {
    notConfigured,
    balance,
    refreshing,
    isOwner,
    mintTokenURI,
    setApprovalForAll,
    isApprovedForAll,
    refresh,
  };
}

/**
 * USDC (MockERC20)：余额 / 授权 / 领取测试币
 *
 * homework03 适配说明：
 *  - MockERC20.mint 在 homework03 合约源码中是**公开函数**（无 onlyOwner），与 hardhatV3Nft 一致；
 *    任何账户都能领取测试币。FaucetModal 按钮对所有账户开放。
 *  - 之前曾误判为 onlyOwner 加 isUsdcOwner 禁用，已修正。
 */
export function useUSDC() {
  const { account } = useWeb3();
  const { getUsdcContract, getUsdcAddress } = useAuxContracts();
  const { run } = useTx();
  const [balance, setBalance] = useState<bigint | null>(null);
  const [allowance, setAllowance] = useState<bigint | null>(null);

  const notConfigured = !getUsdcAddress();

  const refresh = useCallback(async () => {
    const contract = getUsdcContract();
    const auctionAddr = getAuctionAddress();
    if (!contract || !account) {
      setBalance(null);
      setAllowance(null);
      return;
    }
    try {
      const [b, a] = await Promise.all([
        contract.balanceOf(account),
        contract.allowance(account, auctionAddr),
      ]);
      setBalance(b as bigint);
      setAllowance(a as bigint);
    } catch (e) {
      console.error("useUSDC refresh:", e);
    }
  }, [getUsdcContract, getAuctionAddress, account]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const faucetMint = useCallback(
    async (amount: bigint) => {
      const contract = getUsdcContract(true);
      if (!contract || !account) return null;
      return run(async () => {
        const tx = await contract.mint(account, amount);
        await tx.wait();
        return tx;
      }, { successMsg: "USDC 已到账" });
    },
    [getUsdcContract, account, run],
  );

  const approve = useCallback(
    async (spender: string, amount: bigint = MaxUint256) => {
      const contract = getUsdcContract(true);
      if (!contract) return null;
      return run(async () => {
        const tx = await contract.approve(spender, amount);
        await tx.wait();
        return tx;
      }, { successMsg: "USDC 授权成功" });
    },
    [getUsdcContract, run],
  );

  return { notConfigured, balance, allowance, faucetMint, approve, refresh };
}
