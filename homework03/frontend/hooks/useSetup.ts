"use client";

import { useCallback, useEffect, useState } from "react";
import { useWeb3 } from "./useWeb3";
import { useAuctionContract } from "./useAuctionContract";
import { useTx } from "./useTx";
import { deployAllAux } from "@/lib/deploy";
import {
  getMetaNFTAddress,
  getUsdcAddress,
  getOracleAddress,
  getAuxSource,
  saveAuxConfigToLocalStorage,
  isAuxConfigured,
  getLocalAddresses,
} from "@/lib/config";
import { ZERO_ADDRESS } from "@/lib/constants";
import type { SetupState } from "@/types";

function makeInitialState(): SetupState {
  const source = getAuxSource();
  return {
    metaNFT: getMetaNFTAddress(),
    usdc: getUsdcAddress(),
    oracle: getOracleAddress(),
    source,
    exists: { metaNFT: false, usdc: false, oracle: false },
    oracleConfigured: { eth: false, usdc: false },
  };
}

/**
 * 初始化向导状态与操作：检查链上存在性 / 一键部署 / 配置 oracle / 持久化
 */
export function useSetup() {
  const { signer, provider } = useWeb3();
  const { getReadContract, getSignerContract } = useAuctionContract();
  const { run } = useTx();
  const [state, setState] = useState<SetupState>(makeInitialState());
  const [deploying, setDeploying] = useState(false);

  // 客户端 mount 后读 localStorage，合并到 state
  useEffect(() => {
    const local = getLocalAddresses();
    if (local) {
      setState((prev) => ({
        ...prev,
        metaNFT: local.metaNFT,
        usdc: local.usdc,
        oracle: local.oracle,
        deployBlocks: local.deployBlocks,
        source: "localStorage",
      }));
    }
  }, []);

  /** 检查各地址链上是否存在（code 非空）及 oracle 是否配置。
 *  接受 addresses 参数：调用方应传入 state 当前的真实地址（避免从 env-only 函数读到空值）。 */
  const refreshStatus = useCallback(
    async (
      addresses?: { metaNFT: string; usdc: string; oracle: string },
    ) => {
      if (!provider) return;
      const metaNFT =
        addresses?.metaNFT && addresses.metaNFT !== ZERO_ADDRESS
          ? addresses.metaNFT
          : null;
      const usdc =
        addresses?.usdc && addresses.usdc !== ZERO_ADDRESS ? addresses.usdc : null;
      const oracle =
        addresses?.oracle && addresses.oracle !== ZERO_ADDRESS
          ? addresses.oracle
          : null;

      const exists = { metaNFT: false, usdc: false, oracle: false };
      if (metaNFT) exists.metaNFT = (await provider.getCode(metaNFT)).length > 2;
      if (usdc) exists.usdc = (await provider.getCode(usdc)).length > 2;
      if (oracle) exists.oracle = (await provider.getCode(oracle)).length > 2;

      const auction = getReadContract();
      const oracleConfigured = { eth: false, usdc: false };
      if (auction && oracle) {
        const [ethOracle, usdcOracle] = await Promise.all([
          auction.tokenToOracle(ZERO_ADDRESS).catch(() => ZERO_ADDRESS),
          usdc ? auction.tokenToOracle(usdc).catch(() => ZERO_ADDRESS) : Promise.resolve(ZERO_ADDRESS),
        ]);
        oracleConfigured.eth = ethOracle !== ZERO_ADDRESS;
        oracleConfigured.usdc = usdcOracle !== ZERO_ADDRESS;
      }

      setState((prev) => ({ ...prev, exists, oracleConfigured }));
    },
    [provider, getReadContract],
  );

  const deployAll = useCallback(async () => {
    if (!signer) return;
    setDeploying(true);
    try {
      const addresses = await deployAllAux(signer);
      saveAuxConfigToLocalStorage(addresses);
      setState((prev) => ({ ...prev, ...addresses, source: "localStorage" }));
      await configureOraclesLocal(addresses.oracle, addresses.usdc);
      await refreshStatus(addresses);
      return addresses;
    } finally {
      setDeploying(false);
    }
  }, [signer, refreshStatus]);

  /** 配置 ETH/USDC 的 oracle（内部使用，不依赖 state） */
  const configureOraclesLocal = async (oracleAddr: string, usdcAddr: string) => {
    const readContract = getReadContract();
    const signerContract = getSignerContract();
    if (!readContract || !signerContract) return;
    const needsEth = (await readContract.tokenToOracle(ZERO_ADDRESS)) === ZERO_ADDRESS;
    const needsUsdc =
      usdcAddr && (await readContract.tokenToOracle(usdcAddr)) === ZERO_ADDRESS;
    if (needsEth) {
      const tx = await signerContract.setTokenOracle(ZERO_ADDRESS, oracleAddr);
      await tx.wait();
    }
    if (needsUsdc && usdcAddr) {
      const tx = await signerContract.setTokenOracle(usdcAddr, oracleAddr);
      await tx.wait();
    }
  };

  const configureOracles = useCallback(
    async (addresses?: { metaNFT: string; usdc: string; oracle: string }) => {
      const oracle = addresses?.oracle || getOracleAddress();
      const usdc = addresses?.usdc || getUsdcAddress();
      if (!oracle) return null;
      return run(
        async () => {
          await configureOraclesLocal(oracle, usdc);
          return oracle;
        },
        {
          successMsg: "预言机配置成功（ETH + USDC）",
          onSuccess: () => refreshStatus(addresses),
        },
      );
    },
    [getOracleAddress, getUsdcAddress, run, refreshStatus, getReadContract, signer],
  );

  const saveLocal = useCallback((addresses?: { metaNFT: string; usdc: string; oracle: string }) => {
    if (!addresses) return;
    saveAuxConfigToLocalStorage(addresses);
    setState((prev) => ({ ...prev, source: "localStorage" }));
  }, []);

  return {
    state,
    deploying,
    refreshStatus,
    deployAll,
    configureOracles,
    saveLocal,
    isAdmin: true, // setup 页面由管理员使用（页面层做权限校验）
    isAuxConfigured: isAuxConfigured() || Boolean(state.metaNFT && state.usdc && state.oracle),
  };
}
