/** 链与合约常量 */

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

/** 美元价格精度（合约内 ×1e8） */
export const USD_DECIMALS = 8;
/** USDC (MockERC20) 精度 */
export const USDC_DECIMALS = 6;

/** MockOracle 初始 ETH 价格（2000 USD，8 位小数） */
export const ORACLE_INITIAL_ETH_PRICE = 2000n * 10n ** 8n;

/** 起拍价展示的美元单位：合约存整数美元 ×1e8，UI 传整数美元 */
export const AUCTION_MIN_DURATION = 30;

/** localStorage 键名 */
export const LS_AUCTION_CONFIG = "auction.config";

/**
 * Chainlink 真实价格 feed（Ethereum Sepolia 测试网）。
 * 接口与 MetaNFTAuction.getPriceInDollar 直接兼容（AggregatorV3Interface.latestRoundData），
 * 可直接作为 oracle 传入 setTokenOracle，无需部署任何中间合约。
 * 来源：Chainlink 官方文档 https://docs.chain.link/data-feeds/price-feeds/addresses
 */
export const CHAINLINK_SEPOLIA_FEEDS = {
  "ETH/USD": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  "USDC/USD": "0xA2F78ab2355fe2f984D808B5CeE7FD0A93D5270E",
} as const;
