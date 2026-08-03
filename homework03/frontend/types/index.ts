import { BigNumberish } from "ethers";

/** auctions() 返回的 11 元组结构（字段顺序必须与 homework03 MetaNFTAuctionBase.Auction struct 完全一致） */
export interface Auction {
  /** 0: NFT 合约地址 */
  nft: string;
  /** 1: NFT tokenId */
  nftId: bigint;
  /** 2: 卖家 */
  seller: string;
  /** 3: 最高出价者（homework03 struct 中此字段在 startingTime 之前） */
  highestBidder: string;
  /** 4: 起始时间戳(秒) */
  startingTime: bigint;
  /** 5: 时长(秒) */
  duration: bigint;
  /** 6: 支付代币(address(0)=ETH) */
  paymentToken: string;
  /** 7: 起拍价(美元, ×1e8) */
  startingPriceInDollar: bigint;
  /** 8: 最高出价(ETH=wei / ERC20=最小单位) */
  highestBid: bigint;
  /** 9: 最高出价折美元(×1e8) */
  highestBidInDollar: bigint;
  /** 10: 最高出价代币(address(0)=ETH) */
  highestBidToken: string;
}

export type AuctionStatus = "not-started" | "active" | "ended-with-bid" | "ended-no-bid";

/** 拍卖 + 派生展示字段 */
export interface AuctionView extends Auction {
  id: bigint;
  status: AuctionStatus;
  endTime: bigint; // startingTime + duration
  ended: boolean;
}

export interface TokenPrices {
  /** ETH 价格, ×1e8, null=oracle 未配置 */
  eth: bigint | null;
  /** USDC 价格, ×1e8 */
  usdc: bigint | null;
}

export interface TxResult {
  hash: string;
}

/** 各辅助合约部署区块号（/setup 部署时写入，用于优化 getLogs 扫描起点） */
export interface DeployBlocks {
  metaNFT?: number;
  usdc?: number;
  oracle?: number;
}

export interface SetupAddresses {
  metaNFT: string;
  usdc: string;
  oracle: string;
  /** 可选：部署区块号（localStorage 已有配置时可能存在） */
  deployBlocks?: DeployBlocks;
}

export interface SetupState extends SetupAddresses {
  source: "env" | "localStorage" | "none";
  /** 各地址是否在链上存在（code 非空） */
  exists: { metaNFT: boolean; usdc: boolean; oracle: boolean };
  /** ETH/USDC oracle 是否已配置（tokenToOracle 非零） */
  oracleConfigured: { eth: boolean; usdc: boolean };
}

export interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
