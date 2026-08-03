import hre from "hardhat";
import type { Signer } from "ethers";
import type { MetaNFT } from "../types/ethers-contracts/index.js";

/**
 * Hardhat 3：通过 hre.network.create() 创建本地模拟链的网络连接，
 * 获取已连接到该链的 ethers 实例与 networkHelpers。
 * 所有测试文件共享同一个网络连接（ESM 模块缓存），mocha 串行执行互不干扰。
 */
const { ethers, networkHelpers } = await hre.network.create();

export { ethers, networkHelpers };

/**
 * 推进区块时间（自动挖一个新块），用于「拍卖到期」类场景
 */
export async function increaseTime(seconds: number): Promise<void> {
  await networkHelpers.time.increase(seconds);
}

/**
 * 铸造 NFT 并返回实际生成的 tokenId
 * （Hardhat 3 中合约调用默认返回 TransactionResponse，需解析 MintNftToken 事件获取返回值）
 */
export async function mintNFT(nft: MetaNFT, to: string, uri: string, signer: Signer): Promise<bigint> {
  const tx = await nft.connect(signer).mint(to, uri);
  const receipt = await tx.wait();
  if (receipt === null) {
    throw new Error("Mint transaction receipt is null");
  }
  const nftAddress = (await nft.getAddress()).toLowerCase();
  // mint 交易中会包含 Transfer 事件，需要精确匹配 MintNftToken 事件
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== nftAddress) {
      continue;
    }
    const parsed = nft.interface.parseLog(log);
    if (parsed && parsed.name === "MintNftToken") {
      return BigInt(parsed.args[1]);
    }
  }
  throw new Error("MintNftToken event not found");
}

/**
 * 部署全套测试设施：
 * - MetaNFT：拍卖原始 NFT
 * - MockERC20：USDC（6 位小数，模拟真实 USDC）
 * - MockOracle：ETH/USD 预言机（$2000）、USDC/USD 预言机（$1）
 */
export async function deployFixtures() {
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
  return { nft, usdc, ethOracle, usdcOracle };
}

/**
 * 部署 UUPS 代理（MetaNFTAuctionUUPS V1）并调用 initialize
 * @param owner 管理员地址（initialize 参数）
 */
export async function deployUUPSAuction(owner: string) {
  const factory = await ethers.getContractFactory("MetaNFTAuctionUUPS");
  const impl = await factory.deploy();
  const initData = impl.interface.encodeFunctionData("initialize", [owner]);
  const proxyFactory = await ethers.getContractFactory("ERC1967Proxy");
  const proxy = await proxyFactory.deploy(await impl.getAddress(), initData);
  const auction = factory.attach(await proxy.getAddress());
  return { auction, impl, proxy, proxyAddress: await proxy.getAddress() };
}

/**
 * 部署透明代理（MetaNFTAuctionTransparent V1）并调用 initialize
 *
 * 注意：OZ v5.6 的 TransparentUpgradeableProxy 构造函数为 (logic, initialOwner, data)，
 * 代理内部会自动创建并持有自己的 ProxyAdmin（owner = initialOwner）。
 * 这里通过读取 ERC1967 admin 槽位获取内部 ProxyAdmin，供升级测试使用。
 * @param owner 管理员签名者（代理的 initialOwner，即内部 ProxyAdmin 的 owner）
 */
export async function deployTransparentAuction(owner: Signer) {
  const factory = await ethers.getContractFactory("MetaNFTAuctionTransparent");
  const impl = await factory.deploy();
  const initData = impl.interface.encodeFunctionData("initialize", [await owner.getAddress()]);
  const proxyFactory = await ethers.getContractFactory("TransparentUpgradeableProxy");
  const proxy = await proxyFactory.deploy(await impl.getAddress(), await owner.getAddress(), initData);
  const auction = factory.attach(await proxy.getAddress());
  const proxyAddress = await proxy.getAddress();
  // ERC1967 代理管理员槽位：keccak256("eip1967.proxy.admin") - 1
  const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
  const adminStorage = await ethers.provider.getStorage(proxyAddress, ADMIN_SLOT);
  const adminAddress = ethers.getAddress("0x" + adminStorage.slice(-40));
  const proxyAdmin = await ethers.getContractAt("ProxyAdmin", adminAddress);
  return { auction, impl, proxyAdmin, proxy, proxyAddress };
}
