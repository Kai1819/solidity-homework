"use client";

import { useState, useCallback, useEffect } from "react";
import { Contract } from "ethers";
import { useWeb3 } from "./useWeb3";
import { useTx } from "./useTx";
import { getProxyAdminAddress, getAdminAddress } from "@/lib/config";
import { ProxyAdminABI } from "@/lib/abis";

/**
 * 管理员判定 + start / setTokenOracle。
 * 合约 admin 是 private 无 getter，运行时用 ProxyAdmin.owner() 动态判定，env 兜底。
 */
export function useAdmin(auctionContract: Contract | null) {
  const { account, provider } = useWeb3();
  const { run, sending } = useTx();
  const [adminAddress, setAdminAddress] = useState<string>(getAdminAddress());
  const [isAdmin, setIsAdmin] = useState(false);

  const refreshAdmin = useCallback(async () => {
    let resolved = getAdminAddress();
    const proxyAdminAddr = getProxyAdminAddress();
    if (proxyAdminAddr && provider) {
      try {
        const proxyAdmin = new Contract(proxyAdminAddr, ProxyAdminABI, provider);
        const owner = (await proxyAdmin.owner()) as string;
        if (owner && owner !== "0x0000000000000000000000000000000000000000") {
          resolved = owner;
        }
      } catch (e) {
        console.error("useAdmin: query ProxyAdmin.owner failed, fallback env", e);
      }
    }
    setAdminAddress(resolved);
    setIsAdmin(
      Boolean(account && resolved && account.toLowerCase() === resolved.toLowerCase()),
    );
  }, [provider, account]);

  useEffect(() => {
    refreshAdmin();
  }, [refreshAdmin]);

  const start = useCallback(
    async (
      seller: string,
      nftId: bigint,
      nft: string,
      startingPriceInDollar: bigint,
      duration: bigint,
      paymentToken: string,
    ) => {
      if (!auctionContract) return;
      return run(
        async () => {
          const tx = await auctionContract.start(
            seller,
            nftId,
            nft,
            startingPriceInDollar,
            duration,
            paymentToken,
          );
          await tx.wait();
          return tx;
        },
        { successMsg: "拍卖已启动 🚀" },
      );
    },
    [auctionContract, run],
  );

  const setTokenOracle = useCallback(
    async (token: string, oracle: string) => {
      if (!auctionContract) return;
      return run(
        async () => {
          const tx = await auctionContract.setTokenOracle(token, oracle);
          await tx.wait();
          return tx;
        },
        { successMsg: "预言机配置成功" },
      );
    },
    [auctionContract, run],
  );

  return { isAdmin, adminAddress, refreshAdmin, start, setTokenOracle, sending };
}
