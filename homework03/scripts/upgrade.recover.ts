import hre from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * ============================================================================
 *  升级拍卖合约到 V3 并回收意外锁定的 NFT
 * ============================================================================
 *
 *  背景：MetaNFTAuction 代理当前实现为 V1（MetaNFTAuctionTransparentV1），
 *  且链上存在「NFT 已转入合约但 auctions 无记录」的异常资产（tokenId 1/2 锁在合约里）。
 *  V3 新增 recoverNFT()（onlyOwner），可把合约持有的 NFT 回收给管理员。
 *
 *  用法：
 *    # 1) 本地模拟链完整验证（部署 → 锁 NFT → 升级 V3 → 回收 → 断言）：
 *       npx hardhat run scripts/upgrade.recover.ts --network hardhatMainnet
 *
 *    # 2) Sepolia 实际执行升级 + 回收（需 .env 私钥，会消耗真实 gas）：
 *       AUCTION_ADDRESS=<代理地址> PROXY_ADMIN_ADDRESS=<ProxyAdmin> \
 *       NFT_ADDRESS=<MetaNFT> RECOVER_TO=<接收地址> TOKEN_IDS="1,2" \
 *       npx hardhat run scripts/upgrade.recover.ts --network sepolia
 *
 *  可配置环境变量（仅 Sepolia 模式使用）：
 *    AUCTION_ADDRESS     拍卖代理地址（默认取 ignition 部署值 0xc551…070）
 *    PROXY_ADMIN_ADDRESS ProxyAdmin 地址（默认 0x9dcb…bc2）
 *    NFT_ADDRESS         MetaNFT 地址（默认 0x9601…8d40）
 *    RECOVER_TO          回收接收地址（默认 .env 私钥对应账户 = 管理员）
 *    TOKEN_IDS           逗号分隔的 tokenId 列表（默认 "1,2"）
 * ============================================================================
 */

// 已部署到 Sepolia 的合约地址（homework03 ignition 部署产物）
const AUCTION_ADDRESS =
  process.env.AUCTION_ADDRESS || "0xc551E7718663Bf2fF0Df4bFcdDb7d8975117a070";
const PROXY_ADMIN_ADDRESS =
  process.env.PROXY_ADMIN_ADDRESS || "0x9dcb24bfd924c74eac41d5ad15c08c9601634bc2";
const NFT_ADDRESS =
  process.env.NFT_ADDRESS || "0x9601555dCecBf8641132c5440d73885FC29c8d40";

async function main() {
  const connection = await hre.network.connect();
  const networkName = connection.networkName;
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("========== 升级 & 回收 ==========");
  console.log(`  网络      : ${networkName}`);
  console.log(`  操作者    : ${deployer.address}`);

  if (networkName === "hardhatMainnet" || networkName === "hardhatOp") {
    await runLocalVerify(ethers, deployer);
  } else {
    await runSepoliaRecover(ethers, deployer);
  }
}

/**
 * 本地模拟链：完整验证升级 V3 + 回收逻辑
 * 流程：部署设施 → 部署 V1 透明代理 → 铸造并锁 1 个 NFT（模拟历史遗留）
 *     → 升级到 V3 → recoverNFT 回收 → 断言 owner 回到管理员
 */
async function runLocalVerify(ethers: any, deployer: any) {
  console.log("\n🚀 本地模拟链完整验证（V1 → V3 升级 + 回收）...\n");

  // ---- 1. 部署设施 ----
  const nft = await (await ethers.getContractFactory("MetaNFT")).deploy();
  const auctionImplV1 = await (
    await ethers.getContractFactory("MetaNFTAuctionTransparent")
  ).deploy();

  const initData = auctionImplV1.interface.encodeFunctionData("initialize", [
    await deployer.getAddress(),
  ]);
  const proxy = await (
    await ethers.getContractFactory("TransparentUpgradeableProxy")
  ).deploy(await auctionImplV1.getAddress(), await deployer.getAddress(), initData);

  const auction = auctionImplV1.attach(await proxy.getAddress());
  console.log(`  拍卖代理   : ${await proxy.getAddress()}`);
  console.log(`  实现 V1    : ${await auctionImplV1.getAddress()}`);
  console.log(`  代理版本   : ${await auction.getVersion()}`);

  // 获取内部 ProxyAdmin（ERC1967 admin 槽位）
  const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const adminStorage = await ethers.provider.getStorage(await proxy.getAddress(), ADMIN_SLOT);
  const proxyAdmin = await ethers.getContractAt(
    "ProxyAdmin",
    "0x" + adminStorage.slice(-40),
  );
  console.log(`  ProxyAdmin : ${await proxyAdmin.getAddress()}`);

  // ---- 2. 铸造 1 个 NFT 并锁定进合约（模拟历史遗留：直接 transferTo 合约，无拍卖记录） ----
  const ownerAddr = await deployer.getAddress();
  const mintTx = await nft.mint(ownerAddr, "");
  const mintReceipt = await mintTx.wait();
  let tokenId: bigint = 0n;
  for (const log of mintReceipt!.logs) {
    const parsed = nft.interface.parseLog(log);
    if (parsed && parsed.name === "MintNftToken") {
      tokenId = BigInt(parsed.args[1]);
      break;
    }
  }
  console.log(`  铸造 NFT   : #${tokenId.toString()}`);

  // 模拟"锁在合约里且无拍卖记录"：直接授权并 transferTo 拍卖合约
  await (await nft.setApprovalForAll(await proxy.getAddress(), true)).wait();
  await (await nft.transferFrom(ownerAddr, await proxy.getAddress(), tokenId)).wait();
  console.log(`  已锁定     : NFT #${tokenId.toString()} → 拍卖合约（ownerOf = 合约）`);
  console.log(
    `  锁定后 owner: ${await nft.ownerOf(tokenId)}（应为拍卖代理）`,
  );

  // ---- 3. 升级到 V3 ----
  const auctionImplV3 = await (
    await ethers.getContractFactory("MetaNFTAuctionTransparentV3")
  ).deploy();
  const upgradeTx = await proxyAdmin.upgradeAndCall(
    await proxy.getAddress(),
    await auctionImplV3.getAddress(),
    "0x",
  );
  await upgradeTx.wait();
  console.log(`  已升级     : 实现 → ${await auctionImplV3.getAddress()}`);

  // attach V3 ABI 到代理
  const auctionV3 = auctionImplV3.attach(await proxy.getAddress());
  console.log(`  代理版本   : ${await auctionV3.getVersion()}`);

  // ---- 4. 回收 ----
  const recoverTx = await auctionV3.recoverNFT(await nft.getAddress(), tokenId, ownerAddr);
  await recoverTx.wait();
  console.log(`  已回收     : NFT #${tokenId.toString()} → ${ownerAddr}`);

  // ---- 5. 断言 ----
  const finalOwner = await nft.ownerOf(tokenId);
  if (finalOwner.toLowerCase() !== ownerAddr.toLowerCase()) {
    throw new Error(`回收失败：NFT owner 为 ${finalOwner}，期望 ${ownerAddr}`);
  }
  const balance = await nft.balanceOf(ownerAddr);
  console.log(`  断言通过   : owner=${finalOwner}，管理员余额=${balance.toString()}`);
  console.log("\n✅ 本地验证通过：升级 V3 + 回收逻辑正确\n");
}

/**
 * Sepolia 实际执行：部署 V3 实现 → ProxyAdmin 升级 → 回收锁定 NFT
 */
async function runSepoliaRecover(ethers: any, deployer: any) {
  const recoverTo = process.env.RECOVER_TO || (await deployer.getAddress());
  const tokenIds = (process.env.TOKEN_IDS || "1,2")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => BigInt(s));

  console.log(`  拍卖代理   : ${AUCTION_ADDRESS}`);
  console.log(`  ProxyAdmin : ${PROXY_ADMIN_ADDRESS}`);
  console.log(`  MetaNFT    : ${NFT_ADDRESS}`);
  console.log(`  回收接收   : ${recoverTo}`);
  console.log(`  待回收 ID  : [${tokenIds.join(", ")}]`);

  // 升级前快照：确认各 tokenId 当前 owner
  const nft = await ethers.getContractAt("MetaNFT", NFT_ADDRESS);
  for (const id of tokenIds) {
    console.log(`  升级前 NFT #${id.toString()} owner = ${await nft.ownerOf(id)}`);
  }

  // ---- 1. 部署 V3 实现 ----
  console.log("\n🚀 部署 V3 实现合约...");
  const implV3 = await (
    await ethers.getContractFactory("MetaNFTAuctionTransparentV3")
  ).deploy();
  await implV3.waitForDeployment();
  const implV3Address = await implV3.getAddress();
  console.log(`  V3 实现    : ${implV3Address}`);

  // ---- 2. 通过 ProxyAdmin 升级（upgradeAndCall，data 为空） ----
  console.log("\n🔄 通过 ProxyAdmin 升级代理...");
  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", PROXY_ADMIN_ADDRESS);
  const upgradeTx = await proxyAdmin.upgradeAndCall(AUCTION_ADDRESS, implV3Address, "0x");
  const upgradeReceipt = await upgradeTx.wait();
  console.log(
    `  升级 tx    : ${upgradeReceipt?.hash}（block ${upgradeReceipt?.blockNumber}）`,
  );

  // attach V3 ABI 验证版本
  const auctionV3 = await ethers.getContractAt("MetaNFTAuctionTransparentV3", AUCTION_ADDRESS);
  console.log(`  代理版本   : ${await auctionV3.getVersion()}`);

  // ---- 3. 逐个回收 ----
  for (const id of tokenIds) {
    console.log(`\n♻️  回收 NFT #${id.toString()}...`);
    const tx = await auctionV3.recoverNFT(NFT_ADDRESS, id, recoverTo);
    const receipt = await tx.wait();
    console.log(`  回收 tx    : ${receipt?.hash}（block ${receipt?.blockNumber}）`);
    console.log(`  回收后 owner: ${await nft.ownerOf(id)}`);
  }

  // ---- 4. 汇总 ----
  console.log("\n========== 回收结果 ==========");
  for (const id of tokenIds) {
    const owner = await nft.ownerOf(id);
    console.log(`  NFT #${id.toString()} → ${owner}`);
  }
  console.log("✅ 升级 + 回收完成");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
