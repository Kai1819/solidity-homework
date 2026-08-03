import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseUnits } from "ethers";

/**
 * ============================================================================
 *  MetaNFTAuctionUUPS 部署模块（UUPS 代理模式）
 * ============================================================================
 *  部署内容（按顺序执行，Ignition 自动处理依赖）：
 *
 *   1. MetaNFT            ERC721 拍卖原始 NFT（Ownable = 部署者）
 *   2. MockERC20          USDC 支付代币（默认 6 位小数，模拟真实 USDC）
 *   3. MockOracle ×2      ETH/USD 与 USDC/USD 价格预言机（模拟 Chainlink Aggregator）
 *   4. MetaNFTAuctionUUPS UUPS 拍卖「实现」合约（V1）
 *   5. ERC1967Proxy       代理合约，构造时携带 initialize(owner) 调用数据完成初始化
 *   6. setTokenOracle ×2  自动把 ETH 与 USDC 的预言机注册进拍卖合约（onlyOwner）
 *
 *  管理员 owner = 部署账户（m.getAccount(0)，即 --network 对应的第一个签名者）
 *
 *  用法：
 *    npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts \
 *      --network hardhatMainnet          # 本地模拟链（推荐用于本地验证）
 *    npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts \
 *      --network sepolia --parameters ignition/modules/parameters.sepolia.json  # 测试网
 * ============================================================================
 */

/** 以太坊零地址：在拍卖合约中代表「以 ETH 出价」的币种 */
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

export default buildModule("MetaNFTAuctionUUPS", (m) => {
  // ==================== 1. 部署参数（可用 --parameters 覆盖） ====================
  // USDC 小数位：真实 USDC 为 6 位，合约按此换算美元
  const usdcDecimals = m.getParameter("usdcDecimals", 6);
  // USDC 初始供应量：默认 100,000 USDC（parseUnits 语义，含小数位）
  const usdcInitialSupply = m.getParameter("usdcInitialSupply", parseUnits("100000", 6));
  // ETH/USD 预言机价格：默认 $2000（Chainlink 标准为 8 位小数）
  const ethUsdPrice = m.getParameter("ethUsdPrice", parseUnits("2000", 8));
  // USDC/USD 预言机价格：默认 $1（8 位小数）
  const usdcUsdPrice = m.getParameter("usdcUsdPrice", parseUnits("1", 8));

  // 管理员（owner）：部署账户，后续 start/setTokenOracle/升级均以此账户执行
  const owner = m.getAccount(0);

  // ==================== 2. 部署基础设施 ====================
  // 注：公共 RPC 节点对同账户并发 in-flight 交易数有限制，Ignition 默认会把所有无依赖的 future
  // 放在同一 batch 并发 send，导致 "in-flight transaction limit reached" 错。
  // 这里用 after 把独立合约串行化：每个等前一个完成（每个 batch 只 1 笔 tx），
  // 确保公共 RPC 不会拒绝。代价是多 4 个区块确认时间（Sepolia 约 48 秒），但部署稳定可靠。
  const nft = m.contract("MetaNFT", [], { id: "MetaNFT" });

  const usdc = m.contract("MockERC20", ["Mock USDC", "USDC", usdcDecimals, usdcInitialSupply], {
    id: "MockUSDC",
    after: [nft],
  });

  const ethOracle = m.contract("MockOracle", [ethUsdPrice], {
    id: "ETHUSD_Oracle",
    after: [usdc],
  });

  const usdcOracle = m.contract("MockOracle", [usdcUsdPrice], {
    id: "USDCUSD_Oracle",
    after: [ethOracle],
  });

  // ==================== 3. 部署 UUPS 拍卖合约（实现 + 代理） ====================
  // 3.1 部署实现合约（V1，构造时已 _disableInitializers，禁止直接初始化）
  const auctionImpl = m.contract("MetaNFTAuctionUUPS", [], {
    id: "AuctionImpl",
    after: [usdcOracle],
  });

  // 3.2 编码 initialize(owner) 的调用数据，随代理部署一次完成初始化
  const initData = m.encodeFunctionCall(auctionImpl, "initialize", [owner]);

  // 3.3 部署 ERC1967 代理，指向实现合约并携带初始化数据
  const proxy = m.contract("ERC1967Proxy", [auctionImpl, initData], { id: "AuctionProxy" });

  // 3.4 用实现合约的 ABI 绑定代理地址，得到可直接交互的拍卖合约实例
  const auction = m.contractAt("MetaNFTAuctionUUPS", proxy, { id: "Auction" });

  // ==================== 4. 注册价格预言机（onlyOwner） ====================
  // 两个 call 也串行执行（公共 RPC in-flight=1 限制，与第 2 节同理）
  const setEthPrices = m.call(auction, "setTokenOracle", [ETH_ADDRESS, ethOracle], {
    id: "SetETHPrices",
  });
  const setUsdcPrices = m.call(auction, "setTokenOracle", [usdc, usdcOracle], {
    id: "SetUSDCPrices",
    after: [setEthPrices],
  });

  // 导出关键合约地址，供部署报告 / 后续脚本引用
  return { nft, usdc, ethOracle, usdcOracle, auction, proxy, auctionImpl };
});
