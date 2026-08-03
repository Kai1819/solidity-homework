import { expect } from "chai";
import type { Signer } from "ethers";
import type { MetaNFTAuctionUUPS, ERC1967Proxy } from "../types/ethers-contracts/index.js";
import { ethers, deployFixtures, deployUUPSAuction, increaseTime } from "./helpers.js";

/**
 * MetaNFTAuctionUUPS 升级测试
 * 覆盖：V1 初始版本、owner 升级 V1→V2（新功能/状态保留）、权限控制、重复初始化防护、升级后完整拍卖流程
 */
describe("MetaNFTAuctionUUPS（UUPS 升级）", () => {
  let owner: Signer;
  let attacker: Signer;
  let auction: MetaNFTAuctionUUPS;
  let impl: MetaNFTAuctionUUPS;
  let proxy: ERC1967Proxy;
  let proxyAddress: string;

  beforeEach(async () => {
    [owner, attacker] = await ethers.getSigners();
    const u = await deployUUPSAuction(await owner.getAddress());
    auction = u.auction;
    impl = u.impl;
    proxy = u.proxy;
    proxyAddress = u.proxyAddress;
  });

  it("初始版本为 V1", async () => {
    expect(await auction.getVersion()).to.equal("MetaNFTAuctionUUPSV1");
  });

  it("owner 升级到 V2：版本号更新、新功能可用", async () => {
    const v2Factory = await ethers.getContractFactory("MetaNFTAuctionUUPSV2");
    const v2Impl = await v2Factory.deploy();
    await auction.connect(owner).upgradeToAndCall(await v2Impl.getAddress(), "0x");
    // 用 V2 的 ABI 重新绑定代理
    const auctionV2 = v2Factory.attach(proxyAddress);
    expect(await auctionV2.getVersion()).to.equal("MetaNFTAuctionUUPSV2");
    expect(await auctionV2.newFeature()).to.equal("This is a new feature in UUPS V2");
  });

  it("升级后原有状态保留（owner、预言机映射、拍卖数据）", async () => {
    const f = await deployFixtures();
    const nftAddr = await f.nft.getAddress();
    await f.nft.connect(owner).mint(await owner.getAddress(), "ipfs://nft/1");
    await f.nft.connect(owner).setApprovalForAll(proxyAddress, true);
    await auction.connect(owner).setTokenOracle(ethers.ZeroAddress, await f.ethOracle.getAddress());
    await auction
      .connect(owner)
      .start(await owner.getAddress(), 1n, nftAddr, 1000, 60, await f.usdc.getAddress());
    // 升级
    const v2Factory = await ethers.getContractFactory("MetaNFTAuctionUUPSV2");
    const v2Impl = await v2Factory.deploy();
    await auction.connect(owner).upgradeToAndCall(await v2Impl.getAddress(), "0x");
    const auctionV2 = v2Factory.attach(proxyAddress);
    // 状态保留
    expect(await auctionV2.auctionId()).to.equal(1n);
    expect(await auctionV2.tokenToOracle(ethers.ZeroAddress)).to.equal(await f.ethOracle.getAddress());
    const a = await auctionV2.auctions(0n);
    expect(a.seller).to.equal(await owner.getAddress());
    expect(a.nftId).to.equal(1n);
  });

  it("非 owner 升级 revert（not owner）", async () => {
    const v2Impl = await (await ethers.getContractFactory("MetaNFTAuctionUUPSV2")).deploy();
    await expect(auction.connect(attacker).upgradeToAndCall(await v2Impl.getAddress(), "0x")).to.be.revertedWith(
      "not owner",
    );
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
    const v2Factory = await ethers.getContractFactory("MetaNFTAuctionUUPSV2");
    const v2Impl = await v2Factory.deploy();
    await auction.connect(owner).upgradeToAndCall(await v2Impl.getAddress(), "0x");
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
