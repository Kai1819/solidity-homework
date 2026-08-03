"use client";

import { ethers } from "ethers";
import {
  MetaNFTABI,
  MockERC20ABI,
  MockOracleABI,
} from "./abis";
import {
  METANFT_BYTECODE,
  MOCKERC20_BYTECODE,
  MOCKORACLE_BYTECODE,
} from "./bytecodes";
import { ORACLE_INITIAL_ETH_PRICE } from "./constants";
import type { SetupAddresses } from "@/types";

/**
 * 浏览器端部署辅助合约（MetaNFT / USDC / Oracle）。
 * 依赖钱包 signer（admin 需有 Sepolia ETH）。
 */

/** 单个合约部署结果：地址 + 部署区块号 */
export interface DeployResult {
  address: string;
  deployBlock: number;
}

export async function deployMetaNFT(signer: ethers.JsonRpcSigner): Promise<DeployResult> {
  const factory = new ethers.ContractFactory(MetaNFTABI as any, METANFT_BYTECODE, signer);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction()?.wait();
  return {
    address: (await contract.getAddress()) as string,
    deployBlock: receipt?.blockNumber ?? 0,
  };
}

export async function deployUSDC(signer: ethers.JsonRpcSigner): Promise<DeployResult> {
  const factory = new ethers.ContractFactory(MockERC20ABI as any, MOCKERC20_BYTECODE, signer);
  const contract = await factory.deploy("USD Coin", "USDC", 6, ethers.parseUnits("1000000", 6));
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction()?.wait();
  return {
    address: (await contract.getAddress()) as string,
    deployBlock: receipt?.blockNumber ?? 0,
  };
}

export async function deployOracle(signer: ethers.JsonRpcSigner): Promise<DeployResult> {
  const factory = new ethers.ContractFactory(MockOracleABI as any, MOCKORACLE_BYTECODE, signer);
  const contract = await factory.deploy(ORACLE_INITIAL_ETH_PRICE);
  await contract.waitForDeployment();
  const receipt = await contract.deploymentTransaction()?.wait();
  return {
    address: (await contract.getAddress()) as string,
    deployBlock: receipt?.blockNumber ?? 0,
  };
}

/** 部署全部三个辅助合约（顺序执行，便于展示进度） */
export async function deployAllAux(signer: ethers.JsonRpcSigner): Promise<SetupAddresses> {
  const metaNFT = await deployMetaNFT(signer);
  const usdc = await deployUSDC(signer);
  const oracle = await deployOracle(signer);
  return {
    metaNFT: metaNFT.address,
    usdc: usdc.address,
    oracle: oracle.address,
    deployBlocks: {
      metaNFT: metaNFT.deployBlock,
      usdc: usdc.deployBlock,
      oracle: oracle.deployBlock,
    },
  };
}
