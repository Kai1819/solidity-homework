import { expect } from "chai";
import type { Signer } from "ethers";
import type {
  MetaNFTAuctionTransparent,
  MetaNFTAuctionTransparentV3,
  MetaNFT,
  ProxyAdmin,
  TransparentUpgradeableProxy,
} from "../types/ethers-contracts/index.js";
import { ethers, deployFixtures, deployTransparentAuction, increaseTime } from "./helpers.js";

/**
 * MetaNFTAuctionTransparent 升级测试
 * 覆盖：V1 初始版本、ProxyAdmin 升级 V1→V2（新功能/状态保留）、admin 权限隔离、重复初始化防护、升级后完整拍卖流程
 */
describe("MetaNFTAuctionTransparent（透明代理升级）", () => {
  let owner: Signer;
  let attacker: Signer;
  let auction: MetaNFTAuctionTransparent;
  let impl: MetaNFTAuctionTransparent;
  let proxyAdmin: ProxyAdmin;
  let proxy: TransparentUpgradeableProxy;
  let proxyAddress: string;

  beforeEach(async () => {
    [owner, attacker] = await ethers.getSigners();
    const t = await deployTransparentAuction(owner);
    auction = t.auction;
    impl = t.impl;
    proxyAdmin = t.proxyAdmin;
    proxy = t.proxy;
    proxyAddress = t.proxyAddress;
  });

  it("初始版本为 V1", async () => {
    expect(await auction.getVersion()).to.equal("MetaNFTAuctionTransparentV1");
  });

  it("ProxyAdmin 升级到 V2：版本号更新、新功能可用", async () => {
    const v2Factory = await ethers.getContractFactory("MetaNFTAuctionTransparentV2");
    const v2Impl = await v2Factory.deploy();
    await proxyAdmin.connect(owner).upgradeAndCall(proxyAddress, await v2Impl.getAddress(), "0x");
    // 用 V2 的 ABI 重新绑定代理
    const auctionV2 = v2Factory.attach(proxyAddress);
    expect(await auctionV2.getVersion()).to.equal("MetaNFTAuctionTransparentV2");
    expect(await auctionV2.newFeature()).to.equal("This is a new feature in V2");
  });

  it("升级后原有状态保留（预言机映射、拍卖数据）", async () => {
    const f = await deployFixtures();
    await f.nft.connect(owner).mint(await owner.getAddress(), "ipfs://nft/1");
    await f.nft.connect(owner).setApprovalForAll(proxyAddress, true);
    await auction.connect(owner).setTokenOracle(ethers.ZeroAddress, await f.ethOracle.getAddress());
    await auction
      .connect(owner)
      .start(await owner.getAddress(), 1n, await f.nft.getAddress(), 1000, 60, await f.usdc.getAddress());
    // 升级
    const v2Factory = await ethers.getContractFactory("MetaNFTAuctionTransparentV2");
    const v2Impl = await v2Factory.deploy();
    await proxyAdmin.connect(owner).upgradeAndCall(proxyAddress, await v2Impl.getAddress(), "0x");
    const auctionV2 = v2Factory.attach(proxyAddress);
    // 状态保留
    expect(await auctionV2.auctionId()).to.equal(1n);
    expect(await auctionV2.tokenToOracle(ethers.ZeroAddress)).to.equal(await f.ethOracle.getAddress());
    const a = await auctionV2.auctions(0n);
    expect(a.seller).to.equal(await owner.getAddress());
  });

  it("非 admin 直接调用代理管理函数被拦截 revert", async () => {
    const v2Impl = await (await ethers.getContractFactory("MetaNFTAuctionTransparentV2")).deploy();
    // 用 ITransparentUpgradeableProxy 接口（代理 ABI 不暴露管理函数，需通过接口调用）
    const proxyIfc = await ethers.getContractAt("ITransparentUpgradeableProxy", proxyAddress);
    await expect(proxyIfc.connect(attacker).upgradeToAndCall(await v2Impl.getAddress(), "0x")).to.revert(ethers);
  });

  it("非 ProxyAdmin 持有者调用 upgradeAndCall revert（OwnableUnauthorizedAccount）", async () => {
    const v2Impl = await (await ethers.getContractFactory("MetaNFTAuctionTransparentV2")).deploy();
    await expect(proxyAdmin.connect(attacker).upgradeAndCall(proxyAddress, await v2Impl.getAddress(), "0x")).to.be
      .revertedWithCustomError(proxyAdmin, "OwnableUnauthorizedAccount");
  });

  it("代理重复初始化 revert（InvalidInitialization）", async () => {
    await expect(auction.connect(owner).initialize(await owner.getAddress())).to.be.revertedWithCustomError(
      auction,
      "InvalidInitialization",
    );
  });

  it("实现合约直接初始化 revert（构造时已禁用初始化器）", async () => {
    await expect(impl.initialize(await owner.getAddress())).to.be.revertedWithCustomError(
      impl,
      "InvalidInitialization",
    );
  });

  it("升级到 V2 后可继续完成拍卖全流程（集成）", async () => {
    const f = await deployFixtures();
    const signers = await ethers.getSigners();
    const seller = signers[2];
    const bidder = signers[3];
    const nftAddr = await f.nft.getAddress();
    const usdcAddr = await f.usdc.getAddress();
    const sellerAddr = await seller.getAddress();

    // 搭建环境
    await f.nft.connect(owner).mint(sellerAddr, "ipfs://nft/1");
    await f.nft.connect(seller).setApprovalForAll(proxyAddress, true);
    await auction.connect(owner).setTokenOracle(ethers.ZeroAddress, await f.ethOracle.getAddress());
    await auction.connect(owner).setTokenOracle(usdcAddr, await f.usdcOracle.getAddress());
    await f.usdc.connect(owner).mint(await bidder.getAddress(), ethers.parseUnits("10000", 6));
    await f.usdc.connect(bidder).approve(proxyAddress, ethers.MaxUint256);

    // 升级到 V2
    const v2Factory = await ethers.getContractFactory("MetaNFTAuctionTransparentV2");
    const v2Impl = await v2Factory.deploy();
    await proxyAdmin.connect(owner).upgradeAndCall(proxyAddress, await v2Impl.getAddress(), "0x");
    const auctionV2 = v2Factory.attach(proxyAddress);

    // 升级后走完整拍卖流程：start → bid → end
    await auctionV2.connect(owner).start(sellerAddr, 1n, nftAddr, 1000, 60, usdcAddr);
    await auctionV2.connect(bidder).bid(0n, ethers.parseUnits("2000", 6));
    await increaseTime(60);
    await auctionV2.connect(seller).end(0n);

    // 结果断言
    expect(await f.nft.ownerOf(1n)).to.equal(await bidder.getAddress());
    expect(await f.usdc.balanceOf(sellerAddr)).to.equal(ethers.parseUnits("2000", 6));
  });
});

/**
 * MetaNFTAuctionTransparentV3（recoverNFT 回收锁定 NFT）测试
 * 覆盖：V3 版本号、recoverNFT 正常路径 / 三个 revert 分支、升级后完整流程、
 *       V3 实现合约的 _disableInitializers 构造函数分支
 */
describe("MetaNFTAuctionTransparentV3（recoverNFT 回收锁定 NFT）", () => {
  let owner: Signer;
  let attacker: Signer;
  let seller: Signer;
  let receiver: Signer;
  let auctionV3: MetaNFTAuctionTransparentV3;
  let implV3: MetaNFTAuctionTransparentV3;
  let proxyAdmin: ProxyAdmin;
  let proxyAddress: string;
  let nft: MetaNFT;
  let nftAddress: string;

  beforeEach(async () => {
    const signers = await ethers.getSigners();
    [owner, attacker, seller, receiver] = signers;

    // 1) 部署透明代理（V1）
    const t = await deployTransparentAuction(owner);
    proxyAdmin = t.proxyAdmin;
    proxyAddress = t.proxyAddress;

    // 2) 部署 MetaNFT（用其 ABI 用于 transferFrom / ownerOf 等）
    const f = await deployFixtures();
    nft = f.nft;
    nftAddress = await f.nft.getAddress();

    // 3) 部署 V3 实现合约（构造函数会执行 _disableInitializers）
    const v3Factory = await ethers.getContractFactory("MetaNFTAuctionTransparentV3");
    implV3 = await v3Factory.deploy();
  });

  /** 升级代理到 V3 并返回绑定 V3 ABI 的合约实例 */
  async function upgradeToV3(): Promise<MetaNFTAuctionTransparentV3> {
    await proxyAdmin.connect(owner).upgradeAndCall(proxyAddress, await implV3.getAddress(), "0x");
    return (await ethers.getContractFactory("MetaNFTAuctionTransparentV3")).attach(proxyAddress) as unknown as MetaNFTAuctionTransparentV3;
  }

  /** 铸造一个 NFT 并转入拍卖代理（模拟"意外锁定"） */
  async function lockNftIntoProxy(tokenId = 1n): Promise<void> {
    await nft.connect(owner).mint(await owner.getAddress(), `ipfs://locked/${tokenId}`);
    await nft.connect(owner).approve(proxyAddress, tokenId);
    await nft.connect(owner).transferFrom(await owner.getAddress(), proxyAddress, tokenId);
  }

  it("V3 实现合约直接初始化 revert（构造时已禁用初始化器）", async () => {
    await expect(implV3.initialize(await owner.getAddress())).to.be.revertedWithCustomError(
      implV3,
      "InvalidInitialization",
    );
  });

  it("升级 V1→V3 后 getVersion 返回 V3", async () => {
    auctionV3 = await upgradeToV3();
    expect(await auctionV3.getVersion()).to.equal("MetaNFTAuctionTransparentV3");
  });

  it("recoverNFT 正常路径：合约持有 NFT → 成功回收 + 触发 NFTRecovered 事件", async () => {
    auctionV3 = await upgradeToV3();
    await lockNftIntoProxy();
    expect(await nft.ownerOf(1n)).to.equal(proxyAddress);

    // 回收 NFT 给 receiver
    const receiverAddr = await receiver.getAddress();
    await expect(auctionV3.connect(owner).recoverNFT(nftAddress, 1n, receiverAddr))
      .to.emit(auctionV3, "NFTRecovered")
      .withArgs(nftAddress, 1n, receiverAddr);

    // NFT 已转到 receiver
    expect(await nft.ownerOf(1n)).to.equal(receiverAddr);
  });

  it("recoverNFT：接收地址为 0x0 revert（invalid receiver）", async () => {
    auctionV3 = await upgradeToV3();
    await lockNftIntoProxy();

    await expect(auctionV3.connect(owner).recoverNFT(nftAddress, 1n, ethers.ZeroAddress)).to.be.revertedWith(
      "invalid receiver",
    );
  });

  it("recoverNFT：合约不持有该 NFT revert（not held）", async () => {
    auctionV3 = await upgradeToV3();

    // 铸造一个 NFT 给 seller，但**不**转入拍卖合约（合约不持有）
    await nft.connect(owner).mint(await seller.getAddress(), "ipfs://others/1");
    const receiverAddr = await receiver.getAddress();

    await expect(auctionV3.connect(owner).recoverNFT(nftAddress, 1n, receiverAddr)).to.be.revertedWith("not held");
    // 确认 NFT 仍在 seller 名下，没被错误转出
    expect(await nft.ownerOf(1n)).to.equal(await seller.getAddress());
  });

  it("recoverNFT：非 owner 调用 revert（not owner）", async () => {
    auctionV3 = await upgradeToV3();
    await lockNftIntoProxy();

    await expect(
      auctionV3.connect(attacker).recoverNFT(nftAddress, 1n, await receiver.getAddress()),
    ).to.be.revertedWith("not owner");
  });

  it("升级 V1→V3 后完整拍卖流程仍可走（集成）", async () => {
    const signers = await ethers.getSigners();
    const bidder = signers[4];
    const sellerAddr = await seller.getAddress();
    const bidderAddr = await bidder.getAddress();

    // 部署 USDC + USDC/USD oracle
    const usdc = await (
      await ethers.getContractFactory("MockERC20")
    ).deploy("Mock USDC", "USDC", 6, ethers.parseUnits("100000", 6));
    const usdcAddress = await usdc.getAddress();
    const usdcOracle = await (
      await ethers.getContractFactory("MockOracle")
    ).deploy(ethers.parseUnits("1", 8));

    // 卖家授权 NFT，配置 USDC oracle，给 bidder 发 USDC 并授权
    await nft.connect(owner).mint(sellerAddr, "ipfs://nft/1");
    await nft.connect(seller).setApprovalForAll(proxyAddress, true);
    const v1 = (await ethers.getContractFactory("MetaNFTAuctionTransparent")).attach(proxyAddress);
    await v1.connect(owner).setTokenOracle(usdcAddress, await usdcOracle.getAddress());
    await usdc.connect(owner).mint(bidderAddr, ethers.parseUnits("10000", 6));
    await usdc.connect(bidder).approve(proxyAddress, ethers.MaxUint256);

    // 升级到 V3
    auctionV3 = await upgradeToV3();

    // 升级后走完整拍卖流程：start → bid → end
    await auctionV3.connect(owner).start(sellerAddr, 1n, nftAddress, 1000, 60, usdcAddress);
    await auctionV3.connect(bidder).bid(0n, ethers.parseUnits("2000", 6));
    await increaseTime(60);
    await auctionV3.connect(seller).end(0n);

    expect(await nft.ownerOf(1n)).to.equal(bidderAddr);
  });
});
