import hre from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * ============================================================================
 *  与已部署拍卖合约交互脚本
 * ============================================================================
 *  支持两种部署模式（UUPS / 透明代理），两种网络（本地模拟 / Sepolia）。
 *
 *  用法（环境变量配置，避免 CLI 传参歧义）：
 *
 *    1) 查询合约状态（默认动作，只读）：
 *       npx hardhat run scripts/interact.auction.ts --network hardhatMainnet
 *       # 未提供 AUCTION_ADDRESS 时，自动部署一套演示实例再查询（仅本地模拟网络）
 *
 *    2) 对已部署合约执行操作：
 *       AUCTION_MODE=uups AUCTION_ADDRESS=0x... npx hardhat run scripts/interact.auction.ts --network sepolia
 *       ACTION=start    npx hardhat run scripts/interact.auction.ts --network hardhatMainnet  # 启动拍卖
 *       ACTION=bid-eth  npx hardhat run scripts/interact.auction.ts --network hardhatMainnet  # ETH 出价
 *       ACTION=bid-usdc npx hardhat run scripts/interact.auction.ts --network hardhatMainnet  # USDC 出价
 *       ACTION=end      npx hardhat run scripts/interact.auction.ts --network hardhatMainnet  # 结束拍卖
 *       ACTION=full-demo npx hardhat run scripts/interact.auction.ts --network hardhatMainnet # 端到端演示（部署→出价→结束，仅本地）
 *
 *  注意：本地模拟网络（hardhatMainnet）每次命令是全新链，独立 ACTION 无法跨命令串联；
 *  完整流程请用 ACTION=full-demo 一次跑通，或部署到 Sepolia 后按 ACTION 逐步操作。
 *
 *  可配置环境变量：
 *    AUCTION_MODE     uups | transparent（默认 uups）
 *    AUCTION_ADDRESS  已部署的拍卖代理地址（不填则本地自动部署演示实例）
 *    NFT_ADDRESS / USDC_ADDRESS  已部署的 NFT / USDC 地址（不填则本地自动部署）
 *    ACTION           query | start | bid-eth | bid-usdc | end（默认 query）
 *    START_PRICE      起拍价，整数美元（默认 1000）
 *    DURATION         拍卖时长秒（默认 60）
 *    BID_AMOUNT       出价金额（ETH 用 ETH 数量，USDC 用 USDC 数量）
 * ============================================================================
 */

// 以太坊零地址：代表以 ETH 出价的币种
const ETH_ADDRESS = "0x0000000000000000000000000000000000000000";

// 当前网络名（由 main 初始化，供本地模拟判断使用）
let currentNetwork = "";

async function main() {
  // ---------- 1. 读取并打印配置 ----------
  const mode = (process.env.AUCTION_MODE ?? "uups").toLowerCase();
  if (mode !== "uups" && mode !== "transparent") {
    throw new Error(`AUCTION_MODE 仅支持 uups / transparent，当前为 "${mode}"`);
  }
  const action = (process.env.ACTION ?? "query").toLowerCase();
  const auctionAddressInput = process.env.AUCTION_ADDRESS?.trim() || "";
  const nftAddressInput = process.env.NFT_ADDRESS?.trim() || "";
  const usdcAddressInput = process.env.USDC_ADDRESS?.trim() || "";

  // ---------- 2. 连接当前网络，获取 ethers 与签名者 ----------
  const connection = await hre.network.connect();
  currentNetwork = connection.networkName;
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("========== 交互配置 ==========");
  console.log(`  部署模式   : ${mode}`);
  console.log(`  执行动作   : ${action}`);
  console.log(`  拍卖地址   : ${auctionAddressInput || "（未提供，将自动部署演示实例）"}`);
  console.log(`  网络       : ${currentNetwork}`);
  console.log(`  签名者     : ${deployer.address}`);
  console.log("==============================\n");

  // ---------- 3. 获取拍卖合约实例 ----------
  // full-demo 内部自行部署整套实例并完成全流程，无需连接已部署合约，提前处理
  if (action === "full-demo") {
    await runFullDemo(ethers, deployer, mode);
    return;
  }

  // 两种模式的合约 ABI 不同（getVersion 返回值不同），分别 attach；
  // 交互脚本为运维工具，此处使用宽松类型（运行时行为由链上合约保证）
  let auction: any;
  let auctionAddress = auctionAddressInput;

  if (!auctionAddress) {
    // 本地模拟网络：自动部署一套演示实例（MetaNFT + USDC + 预言机 + 拍卖代理）
    if (currentNetwork === "hardhatMainnet" || currentNetwork === "hardhatOp") {
      console.log("🚀 未提供 AUCTION_ADDRESS，正在本地自动部署演示实例...\n");
      auctionAddress = (await deployDemoInstance(ethers, deployer, mode)).auctionAddress;
    } else {
      throw new Error(
        "非本地网络必须提供 AUCTION_ADDRESS（环境变量）才能交互。先运行 ignition 部署获取地址。",
      );
    }
  }

  if (mode === "uups") {
    auction = await ethers.getContractAt("MetaNFTAuctionUUPS", auctionAddress);
  } else {
    auction = await ethers.getContractAt("MetaNFTAuctionTransparent", auctionAddress);
  }
  console.log(`🎯 拍卖合约地址: ${auctionAddress}\n`);

  // ---------- 4. 按动作执行 ----------
  switch (action) {
    case "query":
      await runQuery(ethers, auction);
      break;
    case "start":
      await runStart(ethers, deployer, auction, nftAddressInput, usdcAddressInput);
      break;
    case "bid-eth":
      await runBidEth(ethers, deployer, auction);
      break;
    case "bid-usdc":
      await runBidUsdc(ethers, deployer, auction, usdcAddressInput);
      break;
    case "end":
      await runEnd(ethers, auction);
      break;
    case "full-demo":
      await runFullDemo(ethers, deployer, mode);
      break;
    default:
      throw new Error(`未知 ACTION "${action}"，支持：query | start | bid-eth | bid-usdc | end | full-demo`);
  }
}

/** 查询拍卖合约的关键状态（只读操作） */
async function runQuery(ethers: any, auction: any): Promise<void> {
  console.log("========== 查询合约状态 ==========");
  console.log("1. 合约版本     :", await auction.getVersion());
  console.log("2. 拍卖计数     :", (await auction.auctionId()).toString());

  const ethOracle = await auction.tokenToOracle(ETH_ADDRESS);
  console.log("3. ETH 预言机   :", ethOracle === ethers.ZeroAddress ? "（未设置）" : ethOracle);
  if (ethOracle !== ethers.ZeroAddress) {
    console.log(
      "   ETH/USD 价格 :",
      ethers.formatUnits(await auction.getPriceInDollar(ETH_ADDRESS), 8),
      "USD",
    );
  }

  const auctionId = await auction.auctionId();
  if (auctionId > 0n) {
    const a = await auction.auctions(0n);
    console.log("\n4. 拍卖 #0 详情:");
    console.log("   - NFT 合约    :", a.nft);
    console.log("   - NFT ID      :", a.nftId.toString());
    console.log("   - 卖家        :", a.seller);
    console.log("   - 支付代币    :", a.paymentToken);
    console.log("   - 起拍价      :", ethers.formatUnits(a.startingPriceInDollar, 8), "USD");
    console.log("   - 时长        :", a.duration.toString(), "秒");
    console.log("   - 最高出价者  :", a.highestBidder === ethers.ZeroAddress ? "（暂无）" : a.highestBidder);
    console.log("   - 最高出价    :", a.highestBid.toString());
    console.log("   - 是否已结束  :", await auction.isEnded(0n));
  }
  console.log("==================================");
}

/** 启动一场拍卖：铸造 NFT → 卖家授权 → start */
async function runStart(
  ethers: any,
  deployer: any,
  auction: any,
  nftAddressInput: string,
  usdcAddressInput: string,
): Promise<void> {
  const startingPrice = Number(process.env.START_PRICE ?? 1000);
  const duration = Number(process.env.DURATION ?? 60);

  // 步骤 1：获取 / 部署 NFT 合约
  const nft = nftAddressInput
    ? await ethers.getContractAt("MetaNFT", nftAddressInput)
    : await (await ethers.getContractFactory("MetaNFT")).deploy();
  console.log("1️⃣  NFT 合约:", await nft.getAddress());

  // 步骤 2：获取 / 部署 USDC 支付代币
  const usdc = usdcAddressInput
    ? await ethers.getContractAt("MockERC20", usdcAddressInput)
    : await (
        await ethers.getContractFactory("MockERC20")
      ).deploy("Mock USDC", "USDC", 6, ethers.parseUnits("100000", 6));
  console.log("2️⃣  USDC 合约:", await usdc.getAddress());

  // 步骤 3：铸造 NFT 给部署者（卖家）并授权拍卖合约托管
  console.log("3️⃣  铸造 NFT 并授权拍卖合约...");
  await (await nft.mint(deployer.address, "ipfs://demo/1")).wait();
  await (await nft.setApprovalForAll(await auction.getAddress(), true)).wait();

  // 步骤 4：启动拍卖（管理员 = 部署者，msg.sender 满足 onlyOwner）
  console.log(
    `4️⃣  启动拍卖：NFT#1，起拍价 $${startingPrice}，时长 ${duration} 秒，USDC 计价...`,
  );
  await (
    await auction.start(
      deployer.address,
      1n,
      await nft.getAddress(),
      startingPrice,
      duration,
      await usdc.getAddress(),
    )
  ).wait();
  console.log("✅ 拍卖 #0 已启动，可执行 ACTION=bid-eth / bid-usdc 出价");
}

/** 以 ETH 出价（金额 = BID_AMOUNT，单位 ETH） */
async function runBidEth(ethers: any, deployer: any, auction: any): Promise<void> {
  const amount = ethers.parseEther(process.env.BID_AMOUNT ?? "1");
  console.log(`出价 ETH ${ethers.formatEther(amount)} → 拍卖 #0...`);
  await (await auction.bid(0n, amount, { value: amount })).wait();
  const a = await auction.auctions(0n);
  console.log("✅ 出价成功，当前最高出价者:", a.highestBidder);
  console.log("   最高出价(美元):", ethers.formatUnits(a.highestBidInDollar, 8), "USD");
}

/** 以 USDC 出价（金额 = BID_AMOUNT，单位 USDC；自动铸造并授权） */
async function runBidUsdc(ethers: any, deployer: any, auction: any, usdcAddressInput: string): Promise<void> {
  const amount = ethers.parseUnits(process.env.BID_AMOUNT ?? "2000", 6);
  const usdc = usdcAddressInput
    ? await ethers.getContractAt("MockERC20", usdcAddressInput)
    : await (
        await ethers.getContractFactory("MockERC20")
      ).deploy("Mock USDC", "USDC", 6, ethers.parseUnits("100000", 6));
  // 演示：从 USDC 铸造出价金额给部署者并授权拍卖合约
  await (await usdc.mint(deployer.address, amount)).wait();
  await (await usdc.approve(await auction.getAddress(), amount)).wait();
  console.log(`出价 USDC ${ethers.formatUnits(amount, 6)} → 拍卖 #0...`);
  await (await auction.bid(0n, amount)).wait();
  const a = await auction.auctions(0n);
  console.log("✅ 出价成功，当前最高出价者:", a.highestBidder);
  console.log("   最高出价(美元):", ethers.formatUnits(a.highestBidInDollar, 8), "USD");
}

/** 结束拍卖（本地模拟网络自动推进时间到拍卖到期） */
async function runEnd(ethers: any, auction: any): Promise<void> {
  // 本地模拟网络：直接推进时间使拍卖到期；Sepolia 需等真实时间
  if (currentNetwork === "hardhatMainnet" || currentNetwork === "hardhatOp") {
    const a = await auction.auctions(0n);
    const seconds = Number(a.duration) + 1;
    console.log(`⏳ 本地模拟：推进 ${seconds} 秒使拍卖到期...`);
    await ethers.provider.send("evm_increaseTime", [seconds]);
    await ethers.provider.send("evm_mine");
  } else {
    const ended = await auction.isEnded(0n);
    if (!ended) {
      throw new Error("拍卖尚未到期（Sepolia 需等待真实时间），无法结束");
    }
  }
  console.log("结束拍卖 #0...");
  await (await auction.end(0n)).wait();
  const a = await auction.auctions(0n);
  console.log("✅ 拍卖结束，NFT 已转给最高出价者:", a.highestBidder);
}

/**
 * 端到端演示（仅本地模拟网络）：部署 → 启动拍卖 → ETH 出价 → USDC 高价替换 → 结束
 * 一次运行内完成，避免本地模拟链跨命令状态丢失的问题
 */
async function runFullDemo(ethers: any, deployer: any, mode: string): Promise<void> {
  if (currentNetwork !== "hardhatMainnet" && currentNetwork !== "hardhatOp") {
    throw new Error("full-demo 仅支持本地模拟网络（hardhatMainnet / hardhatOp）");
  }
  console.log("🎬 开始端到端演示（deploy → start → bid-eth → bid-usdc → end）\n");

  // 1. 部署演示实例
  const demo = await deployDemoInstance(ethers, deployer, mode);
  const auction =
    mode === "uups"
      ? await ethers.getContractAt("MetaNFTAuctionUUPS", demo.auctionAddress)
      : await ethers.getContractAt("MetaNFTAuctionTransparent", demo.auctionAddress);
  const nft = await ethers.getContractAt("MetaNFT", demo.nftAddress);
  const usdc = await ethers.getContractAt("MockERC20", demo.usdcAddress);

  // 2. 启动拍卖：铸造 NFT → 卖家授权 → start
  console.log("\n[1/5] 启动拍卖（铸造 NFT → 授权 → start）...");
  await (await nft.mint(deployer.address, "ipfs://demo/1")).wait();
  await (await nft.setApprovalForAll(demo.auctionAddress, true)).wait();
  await (
    await auction.start(deployer.address, 1n, demo.nftAddress, 1000, 60, demo.usdcAddress)
  ).wait();

  // 3. ETH 出价：部署者出 1 ETH（$2000）
  console.log("[2/5] 买家 A 以 ETH 出价 1 ETH（$2000）...");
  const bidA = ethers.parseEther("1");
  await (await auction.bid(0n, bidA, { value: bidA })).wait();

  // 4. USDC 高价替换：第二账户出 3000 USDC（$3000），触发退款给买家 A
  const signers = await ethers.getSigners();
  const bidderB = signers[1];
  console.log(`[3/5] 买家 B（${bidderB.address}）以 USDC 出价 3000 USDC（$3000），买家 A 应收到退款...`);
  await (await usdc.mint(bidderB.address, ethers.parseUnits("3000", 6))).wait();
  await (await usdc.connect(bidderB).approve(demo.auctionAddress, ethers.MaxUint256)).wait();
  await (await auction.connect(bidderB).bid(0n, ethers.parseUnits("3000", 6))).wait();

  // 5. 推进时间并结束拍卖
  console.log("[4/5] 推进时间使拍卖到期...");
  await ethers.provider.send("evm_increaseTime", [61]);
  await ethers.provider.send("evm_mine");
  console.log("[5/5] 结束拍卖...");
  await (await auction.end(0n)).wait();

  // 汇总结果
  console.log("\n========== 演示结果 ==========");
  const a = await auction.auctions(0n);
  console.log("  合约版本      :", await auction.getVersion());
  console.log("  最终最高出价者:", a.highestBidder);
  console.log("  最高出价(美元):", ethers.formatUnits(a.highestBidInDollar, 8), "USD");
  console.log("  NFT 归属      :", await nft.ownerOf(1n), "（应为最高出价者）");
  console.log("  卖家 USDC 余额:", ethers.formatUnits(await usdc.balanceOf(deployer.address), 6), "USDC");
  console.log("================================");
}

/**
 * 本地演示：手动部署一套完整设施（与 ignition/modules 中的模块等价）
 * 返回关键合约地址
 */
async function deployDemoInstance(ethers: any, deployer: any, mode: string) {
  // 1. 基础设施
  const nft = await (await ethers.getContractFactory("MetaNFT")).deploy();
  const usdc = await (
    await ethers.getContractFactory("MockERC20")
  ).deploy("Mock USDC", "USDC", 6, ethers.parseUnits("100000", 6));
  const ethOracle = await (
    await ethers.getContractFactory("MockOracle")
  ).deploy(ethers.parseUnits("2000", 8)); // ETH/USD = $2000
  const usdcOracle = await (
    await ethers.getContractFactory("MockOracle")
  ).deploy(ethers.parseUnits("1", 8)); // USDC/USD = $1

  // 2. 拍卖实现 + 代理 + 初始化
  let proxyAddress: string;
  if (mode === "uups") {
    const impl = await (await ethers.getContractFactory("MetaNFTAuctionUUPS")).deploy();
    const initData = impl.interface.encodeFunctionData("initialize", [deployer.address]);
    const proxy = await (
      await ethers.getContractFactory("ERC1967Proxy")
    ).deploy(await impl.getAddress(), initData);
    proxyAddress = await proxy.getAddress();
  } else {
    const impl = await (await ethers.getContractFactory("MetaNFTAuctionTransparent")).deploy();
    const initData = impl.interface.encodeFunctionData("initialize", [deployer.address]);
    const proxy = await (
      await ethers.getContractFactory("TransparentUpgradeableProxy")
    ).deploy(await impl.getAddress(), deployer.address, initData);
    proxyAddress = await proxy.getAddress();
  }

  // 3. 注册预言机
  const auction =
    mode === "uups"
      ? await ethers.getContractAt("MetaNFTAuctionUUPS", proxyAddress)
      : await ethers.getContractAt("MetaNFTAuctionTransparent", proxyAddress);
  await (await auction.setTokenOracle(ETH_ADDRESS, await ethOracle.getAddress())).wait();
  await (await auction.setTokenOracle(await usdc.getAddress(), await usdcOracle.getAddress())).wait();

  console.log("   - MetaNFT       :", await nft.getAddress());
  console.log("   - MockUSDC      :", await usdc.getAddress());
  console.log("   - ETH/USD 预言机:", await ethOracle.getAddress());
  console.log("   - USDC/USD 预言机:", await usdcOracle.getAddress());
  console.log("   - 拍卖代理      :", proxyAddress);
  return {
    nftAddress: await nft.getAddress(),
    usdcAddress: await usdc.getAddress(),
    auctionAddress: proxyAddress,
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 执行失败:", error.message ?? error);
    process.exit(1);
  });
