import { expect } from "chai";
import type { Signer } from "ethers";
import type { MetaNFT, MockERC20, MockOracle, MetaNFTAuctionUUPS } from "../types/ethers-contracts/index.js";
import { ethers, deployFixtures, deployUUPSAuction, increaseTime, mintNFT } from "./helpers.js";

// 测试常量（价格均为 8 位小数的美元计价，纯 bigint 字面量，避免模块顶层依赖 hre）
const ETH_USD_PRICE = 2000n * 10n ** 8n; // $2000
const USDC_USD_PRICE = 1n * 10n ** 8n; // $1
const STARTING_PRICE = 1000; // 入参为整数美元（合约内乘 1e8 存储）
const DURATION = 60; // 秒

/**
 * MetaNFTAuction 核心功能测试（通过 UUPS 代理部署，逻辑与透明代理共用 MetaNFTAuctionBase）
 * 覆盖：预言机配置、启动拍卖、ETH/ERC20 出价与退款、结束拍卖、状态查询
 */
describe("MetaNFTAuction（UUPS 代理部署）", () => {
  let owner: Signer;
  let seller: Signer;
  let bidder1: Signer;
  let bidder2: Signer;
  let nft: MetaNFT;
  let usdc: MockERC20;
  let ethOracle: MockOracle;
  let usdcOracle: MockOracle;
  let auction: MetaNFTAuctionUUPS;
  let auctionAddress: string;

  beforeEach(async () => {
    [owner, seller, bidder1, bidder2] = await ethers.getSigners();
    const f = await deployFixtures();
    nft = f.nft;
    usdc = f.usdc;
    ethOracle = f.ethOracle;
    usdcOracle = f.usdcOracle;

    const u = await deployUUPSAuction(await owner.getAddress());
    auction = u.auction;
    auctionAddress = u.proxyAddress;

    // 铸造 NFT 给卖家并授权给拍卖合约（start 时锁仓）
    await nft.connect(owner).mint(await seller.getAddress(), "ipfs://nft/1");
    await nft.connect(seller).setApprovalForAll(auctionAddress, true);

    // 设置预言机：ETH 与 USDC 到美元
    await auction.connect(owner).setTokenOracle(ethers.ZeroAddress, await ethOracle.getAddress());
    await auction.connect(owner).setTokenOracle(await usdc.getAddress(), await usdcOracle.getAddress());

    // 给买家铸造并授权 USDC
    await usdc.connect(owner).mint(await bidder1.getAddress(), ethers.parseUnits("100000", 6));
    await usdc.connect(owner).mint(await bidder2.getAddress(), ethers.parseUnits("100000", 6));
    await usdc.connect(bidder1).approve(auctionAddress, ethers.MaxUint256);
    await usdc.connect(bidder2).approve(auctionAddress, ethers.MaxUint256);
  });

  /** 启动标准拍卖：拍品 0 = 卖家 NFT#1，USDC 计价，$1000 起拍，60 秒 */
  async function startAuction(): Promise<void> {
    await auction.connect(owner).start(
      await seller.getAddress(),
      1n,
      await nft.getAddress(),
      STARTING_PRICE,
      DURATION,
      await usdc.getAddress(),
    );
  }

  describe("setTokenOracle（预言机配置）", () => {
    it("owner 可以设置代币预言机", async () => {
      expect(await auction.tokenToOracle(ethers.ZeroAddress)).to.equal(await ethOracle.getAddress());
      expect(await auction.tokenToOracle(await usdc.getAddress())).to.equal(await usdcOracle.getAddress());
    });

    it("非 owner 设置预言机 revert（not owner）", async () => {
      await expect(
        auction.connect(bidder1).setTokenOracle(await usdc.getAddress(), await usdcOracle.getAddress()),
      ).to.be.revertedWith("not owner");
    });

    it("预言机地址为零 revert（invalid oracle）", async () => {
      await expect(
        auction.connect(owner).setTokenOracle(await usdc.getAddress(), ethers.ZeroAddress),
      ).to.be.revertedWith("invalid oracle");
    });
  });

  describe("start（启动拍卖）", () => {
    it("owner 启动拍卖：NFT 锁入合约、状态正确、发出事件、auctionId 自增", async () => {
      const sellerAddr = await seller.getAddress();
      await expect(
        auction
          .connect(owner)
          .start(sellerAddr, 1n, await nft.getAddress(), STARTING_PRICE, DURATION, await usdc.getAddress()),
      ).to.emit(auction, "StartBid");
      // NFT 已从卖家锁入拍卖合约
      expect(await nft.ownerOf(1n)).to.equal(auctionAddress);
      expect(await nft.balanceOf(sellerAddr)).to.equal(0n);
      // 拍卖详情
      const a = await auction.auctions(0n);
      expect(a.seller).to.equal(sellerAddr);
      expect(a.nft).to.equal(await nft.getAddress());
      expect(a.nftId).to.equal(1n);
      expect(a.duration).to.equal(60n);
      expect(a.paymentToken).to.equal(await usdc.getAddress());
      // 起拍价按 $1000 * 1e8 存储
      expect(a.startingPriceInDollar).to.equal(ethers.parseUnits("1000", 8));
      expect(await auction.auctionId()).to.equal(1n);
    });

    it("非 owner 启动拍卖 revert（not owner）", async () => {
      await expect(
        auction
          .connect(seller)
          .start(await seller.getAddress(), 1n, await nft.getAddress(), STARTING_PRICE, DURATION, await usdc.getAddress()),
      ).to.be.revertedWith("not owner");
    });

    it("拍卖时长小于 30 秒 revert（invalidate duration）", async () => {
      await expect(
        auction
          .connect(owner)
          .start(await seller.getAddress(), 1n, await nft.getAddress(), STARTING_PRICE, 29, await usdc.getAddress()),
      ).to.be.revertedWith("invalidate duration");
    });

    it("NFT 地址为零 revert（invalid nft）", async () => {
      await expect(
        auction
          .connect(owner)
          .start(await seller.getAddress(), 1n, ethers.ZeroAddress, STARTING_PRICE, DURATION, await usdc.getAddress()),
      ).to.be.revertedWith("invalid nft");
    });

    it("卖家未授权拍卖合约时，启动拍卖 revert（NFT 无法锁仓）", async () => {
      // 使用一个全新的卖家地址（beforeEach 中 seller 已对拍卖合约做了批量授权）
      const signers = await ethers.getSigners();
      const freshSeller = signers[4];
      const tokenId = await mintNFT(nft, await freshSeller.getAddress(), "ipfs://nft/2", owner);
      await expect(
        auction
          .connect(owner)
          .start(await freshSeller.getAddress(), tokenId, await nft.getAddress(), STARTING_PRICE, DURATION, await usdc.getAddress()),
      ).to.revert(ethers);
    });
  });

  describe("bid（ETH 出价）", () => {
    beforeEach(async () => {
      await startAuction();
    });

    it("买家以 ETH 出价成功：记录最高出价并折合美元", async () => {
      const bidder1Addr = await bidder1.getAddress();
      await expect(
        auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") }),
      )
        .to.emit(auction, "Bid")
        .withArgs(bidder1Addr, ethers.parseEther("1"));
      const a = await auction.auctions(0n);
      expect(a.highestBidder).to.equal(bidder1Addr);
      expect(a.highestBid).to.equal(ethers.parseEther("1"));
      // 1 ETH × $2000 = $2000（1e8 位小数存储）
      expect(a.highestBidInDollar).to.equal(ETH_USD_PRICE);
      expect(a.highestBidToken).to.equal(ethers.ZeroAddress);
    });

    it("amount 与 msg.value 不一致 revert（amount mismatch）", async () => {
      await expect(
        auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("2") }),
      ).to.be.revertedWith("amount mismatch");
    });

    it("未设置 ETH 预言机时出价 revert（oracle not set）", async () => {
      // 部署一个只配置了 USDC 预言机、未配置 ETH 预言机的拍卖合约
      const fresh = await deployUUPSAuction(await owner.getAddress());
      const freshAuction = fresh.auction;
      const freshAddress = fresh.proxyAddress;
      const tokenId = await mintNFT(nft, await seller.getAddress(), "ipfs://nft/9", owner);
      await nft.connect(seller).setApprovalForAll(freshAddress, true);
      await freshAuction.connect(owner).setTokenOracle(await usdc.getAddress(), await usdcOracle.getAddress());
      await freshAuction
        .connect(owner)
        .start(await seller.getAddress(), tokenId, await nft.getAddress(), STARTING_PRICE, DURATION, await usdc.getAddress());
      await expect(
        freshAuction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") }),
      ).to.be.revertedWith("oracle not set");
    });

    it("拍卖未开始时出价 revert（not started）", async () => {
      await expect(
        auction.connect(bidder1).bid(7n, ethers.parseEther("1"), { value: ethers.parseEther("1") }),
      ).to.be.revertedWith("not started");
    });

    it("出价不高于起拍价 revert（invalid startingPrice）", async () => {
      // 0.1 ETH × $2000 = $200 < 起拍价 $1000
      await expect(
        auction.connect(bidder1).bid(0n, ethers.parseEther("0.1"), { value: ethers.parseEther("0.1") }),
      ).to.be.revertedWith("invalid startingPrice");
    });

    it("出价不高于当前最高价 revert（invalid highestBid）", async () => {
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      // 相同金额 1 ETH（$2000）不高于当前最高价 $2000
      await expect(
        auction.connect(bidder2).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") }),
      ).to.be.revertedWith("invalid highestBid");
    });

    it("拍卖结束后出价 revert（ended）", async () => {
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await increaseTime(DURATION);
      await expect(
        auction.connect(bidder2).bid(0n, ethers.parseEther("2"), { value: ethers.parseEther("2") }),
      ).to.be.revertedWith("ended");
    });

    it("更高出价替换当前最高价，并给上一个出价者退还 ETH", async () => {
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await expect(
        auction.connect(bidder2).bid(0n, ethers.parseEther("2"), { value: ethers.parseEther("2") }),
      ).to.changeEtherBalance(ethers, bidder1, ethers.parseEther("1"));
      const a = await auction.auctions(0n);
      expect(a.highestBidder).to.equal(await bidder2.getAddress());
      expect(a.highestBid).to.equal(ethers.parseEther("2"));
      // 2 ETH × $2000 = $4000
      expect(a.highestBidInDollar).to.equal(ethers.parseUnits("4000", 8));
    });
  });

  describe("bid（ERC20 出价）", () => {
    beforeEach(async () => {
      await startAuction();
    });

    it("买家以 USDC 出价成功：代币锁入合约并折合美元", async () => {
      const bidder1Addr = await bidder1.getAddress();
      await expect(auction.connect(bidder1).bid(0n, ethers.parseUnits("2000", 6))).to.changeTokenBalance(
        ethers,
        usdc,
        auctionAddress,
        ethers.parseUnits("2000", 6),
      );
      const a = await auction.auctions(0n);
      expect(a.highestBidder).to.equal(bidder1Addr);
      expect(a.highestBid).to.equal(ethers.parseUnits("2000", 6));
      // 2000 USDC × $1 = $2000
      expect(a.highestBidInDollar).to.equal(ethers.parseUnits("2000", 8));
      expect(a.highestBidToken).to.equal(await usdc.getAddress());
    });

    it("出价金额为 0 revert（invalid amount）", async () => {
      await expect(auction.connect(bidder1).bid(0n, 0n)).to.be.revertedWith("invalid amount");
    });

    it("更高出价替换当前最高价，并退还上一个出价者的 USDC", async () => {
      await auction.connect(bidder1).bid(0n, ethers.parseUnits("2000", 6));
      await expect(auction.connect(bidder2).bid(0n, ethers.parseUnits("3000", 6))).to.changeTokenBalance(
        ethers,
        usdc,
        bidder1,
        ethers.parseUnits("2000", 6),
      );
      const a = await auction.auctions(0n);
      expect(a.highestBidder).to.equal(await bidder2.getAddress());
      expect(a.highestBidInDollar).to.equal(ethers.parseUnits("3000", 8));
    });

    it("跨币种出价：USDC 出价替换 ETH 出价时，退回 ETH 给原出价者", async () => {
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await expect(auction.connect(bidder2).bid(0n, ethers.parseUnits("3000", 6))).to.changeEtherBalance(
        ethers,
        bidder1,
        ethers.parseEther("1"),
      );
      const a = await auction.auctions(0n);
      expect(a.highestBidder).to.equal(await bidder2.getAddress());
      expect(a.highestBidToken).to.equal(await usdc.getAddress());
    });
  });

  describe("end（结束拍卖）", () => {
    it("ETH 拍卖结束：NFT 转给最高出价者、拍款（ETH）转给卖家", async () => {
      await startAuction();
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await increaseTime(DURATION);
      const sellerAddr = await seller.getAddress();
      const before = await ethers.provider.getBalance(sellerAddr);
      await auction.connect(bidder2).end(0n);
      // NFT 转移给最高出价者，合约不再持有
      expect(await nft.ownerOf(1n)).to.equal(await bidder1.getAddress());
      expect(await nft.balanceOf(auctionAddress)).to.equal(0n);
      // 拍款 1 ETH 转给卖家
      const after = await ethers.provider.getBalance(sellerAddr);
      expect(after - before).to.equal(ethers.parseEther("1"));
    });

    it("USDC 拍卖结束：拍款以 USDC 转给卖家", async () => {
      await startAuction();
      await auction.connect(bidder1).bid(0n, ethers.parseUnits("2000", 6));
      await increaseTime(DURATION);
      const sellerAddr = await seller.getAddress();
      const before = await usdc.balanceOf(sellerAddr);
      await auction.connect(bidder2).end(0n);
      expect(await nft.ownerOf(1n)).to.equal(await bidder1.getAddress());
      const after = await usdc.balanceOf(sellerAddr);
      expect(after - before).to.equal(ethers.parseUnits("2000", 6));
    });

    it("结束拍卖发出 EndBid 事件", async () => {
      await startAuction();
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await increaseTime(DURATION);
      await expect(auction.connect(bidder2).end(0n)).to.emit(auction, "EndBid").withArgs(0n);
    });

    it("没有出价时结束 revert（no bids）", async () => {
      await startAuction();
      await increaseTime(DURATION);
      await expect(auction.connect(bidder2).end(0n)).to.be.revertedWith("no bids");
    });

    it("拍卖未结束时结束 revert（not ended）", async () => {
      await startAuction();
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await expect(auction.connect(bidder2).end(0n)).to.be.revertedWith("not ended");
    });

    it("重复结束 revert（NFT 已被转出）", async () => {
      await startAuction();
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      await increaseTime(DURATION);
      await auction.connect(bidder2).end(0n);
      await expect(auction.connect(bidder2).end(0n)).to.revert(ethers);
    });
  });

  describe("isEnded / getPriceInDollar（状态查询）", () => {
    it("isEnded：拍卖进行中为 false，时间到达后为 true", async () => {
      await startAuction();
      expect(await auction.isEnded(0n)).to.equal(false);
      await increaseTime(DURATION);
      expect(await auction.isEnded(0n)).to.equal(true);
    });

    it("getPriceInDollar：返回预言机配置的价格（1e8 位小数）", async () => {
      expect(await auction.getPriceInDollar(ethers.ZeroAddress)).to.equal(ETH_USD_PRICE);
      expect(await auction.getPriceInDollar(await usdc.getAddress())).to.equal(USDC_USD_PRICE);
    });

    it("getPriceInDollar：未配置预言机的代币 revert（oracle not set）", async () => {
      await expect(auction.getPriceInDollar(await bidder1.getAddress())).to.be.revertedWith("oracle not set");
    });

    it("MockOracle.setPrice 改价后：getPrice 返回新价 + 拍卖 bid 折算跟随变化", async () => {
      // 初始：ETH/USD = $2000
      expect(await ethOracle.getPrice()).to.equal(ETH_USD_PRICE);
      expect(await auction.getPriceInDollar(ethers.ZeroAddress)).to.equal(ETH_USD_PRICE);

      // 改价：ETH/USD = $3000（模拟价格波动）
      const newPrice = ethers.parseUnits("3000", 8);
      await ethOracle.connect(owner).setPrice(newPrice);
      expect(await ethOracle.getPrice()).to.equal(newPrice);
      expect(await auction.getPriceInDollar(ethers.ZeroAddress)).to.equal(newPrice);

      // 实际 bid 折算跟随新价：1 ETH(1e18 wei) × $3000 / 1e18 = 3000e8
      // 启动 ETH 模式拍卖（paymentToken = 0x0）
      await auction.connect(owner).start(
        await seller.getAddress(),
        1n,
        await nft.getAddress(),
        STARTING_PRICE,
        DURATION,
        ethers.ZeroAddress,
      );
      await auction.connect(bidder1).bid(0n, ethers.parseEther("1"), { value: ethers.parseEther("1") });
      const a = await auction.auctions(0n);
      expect(a.highestBidInDollar).to.equal(ethers.parseUnits("3000", 8));
    });
  });
});
