import { expect } from "chai";
import type { Signer } from "ethers";
import type { MockERC20, MockOracle } from "../types/ethers-contracts/index.js";
import { ethers } from "./helpers.js";

/**
 * Mock 合约单元测试（对应 Foundry 版 test/Mock.t.sol）
 * 覆盖：MockERC20（构造/decimals/mint/事件/转账）、MockOracle（latestRoundData/setPrice/getPrice）
 */
describe("Mock 合约（MockERC20 / MockOracle）", () => {
  describe("MockERC20（模拟 USDC）", () => {
    let owner: Signer;
    let alice: Signer;
    let usdc: MockERC20;

    beforeEach(async () => {
      [owner, alice] = await ethers.getSigners();
      usdc = await (await ethers.getContractFactory("MockERC20")).deploy(
        "Mock USDC",
        "USDC",
        6,
        ethers.parseUnits("100000", 6),
      );
    });

    it("构造：名称、符号、decimals、初始供应量归部署者", async () => {
      expect(await usdc.name()).to.equal("Mock USDC");
      expect(await usdc.symbol()).to.equal("USDC");
      expect(await usdc.decimals()).to.equal(6);
      // 初始供应量 100,000 USDC（6 位小数）全部给部署者
      expect(await usdc.balanceOf(await owner.getAddress())).to.equal(ethers.parseUnits("100000", 6));
      expect(await usdc.totalSupply()).to.equal(ethers.parseUnits("100000", 6));
    });

    it("构造：发出 MintToken 事件（部署者 + 初始供应量）", async () => {
      // 单独部署一次以便干净断言事件
      const ownerAddr = await owner.getAddress();
      const supply = ethers.parseUnits("5000", 6);
      const freshUsdc = await (await ethers.getContractFactory("MockERC20")).deploy("Mock USDC", "USDC", 6, supply);
      const deployTx = freshUsdc.deploymentTransaction();
      if (deployTx === null) {
        throw new Error("deployment transaction is null");
      }
      await expect(deployTx).to.emit(freshUsdc, "MintToken").withArgs(ownerAddr, supply);
    });

    it("mint：任意账户可无限铸造（无权限限制）并发出 MintToken 事件", async () => {
      const aliceAddr = await alice.getAddress();
      const amount = ethers.parseUnits("1234", 6);
      // 非 owner（alice）也能铸造
      await expect(usdc.connect(alice).mint(aliceAddr, amount))
        .to.emit(usdc, "MintToken")
        .withArgs(aliceAddr, amount);
      expect(await usdc.balanceOf(aliceAddr)).to.equal(amount);
      expect(await usdc.totalSupply()).to.equal(ethers.parseUnits("101234", 6));
    });

    it("transfer：账户间转账更新余额与 totalSupply 不变", async () => {
      const ownerAddr = await owner.getAddress();
      const aliceAddr = await alice.getAddress();
      const amount = ethers.parseUnits("500", 6);
      await usdc.connect(owner).transfer(aliceAddr, amount);
      expect(await usdc.balanceOf(ownerAddr)).to.equal(ethers.parseUnits("99500", 6));
      expect(await usdc.balanceOf(aliceAddr)).to.equal(amount);
      expect(await usdc.totalSupply()).to.equal(ethers.parseUnits("100000", 6));
    });

    it("approve + transferFrom：被授权者可以代扣代币", async () => {
      const ownerAddr = await owner.getAddress();
      const aliceAddr = await alice.getAddress();
      const amount = ethers.parseUnits("300", 6);
      await usdc.connect(owner).approve(aliceAddr, amount);
      expect(await usdc.allowance(ownerAddr, aliceAddr)).to.equal(amount);
      // alice 从 owner 账户扣 300 USDC 转给自己
      await usdc.connect(alice).transferFrom(ownerAddr, aliceAddr, amount);
      expect(await usdc.balanceOf(aliceAddr)).to.equal(amount);
      expect(await usdc.allowance(ownerAddr, aliceAddr)).to.equal(0n);
    });
  });

  describe("MockOracle（模拟 Chainlink 喂价）", () => {
    let oracle: MockOracle;

    beforeEach(async () => {
      oracle = await (await ethers.getContractFactory("MockOracle")).deploy(
        ethers.parseUnits("2000", 8), // ETH/USD = $2000（8 位小数）
      );
    });

    it("latestRoundData：返回固定轮次（roundId=1）与构造价格", async () => {
      const [roundId, answer, startedAt, updatedAt, answeredInRound] = await oracle.latestRoundData();
      expect(roundId).to.equal(1n);
      expect(answer).to.equal(ethers.parseUnits("2000", 8));
      expect(startedAt).to.equal(updatedAt); // 时间戳相同（写死当前区块时间）
      expect(answeredInRound).to.equal(1n);
    });

    it("setPrice：改价后 getPrice 与 latestRoundData 同步更新", async () => {
      expect(await oracle.getPrice()).to.equal(ethers.parseUnits("2000", 8));

      // 模拟价格波动：ETH/USD 涨到 $3000
      await oracle.setPrice(ethers.parseUnits("3000", 8));
      expect(await oracle.getPrice()).to.equal(ethers.parseUnits("3000", 8));

      const [, answer] = await oracle.latestRoundData();
      expect(answer).to.equal(ethers.parseUnits("3000", 8));
    });

    it("getPrice：支持负数价格（价格可为负的边界，AggregatorV3Interface 用 int256）", async () => {
      // 极端场景：价格跌为 0（int256 边界不溢出）
      await oracle.setPrice(0n);
      expect(await oracle.getPrice()).to.equal(0n);

      // 构造负数价格也合法（int256）
      const negOracle = await (await ethers.getContractFactory("MockOracle")).deploy(-100n);
      expect(await negOracle.getPrice()).to.equal(-100n);
    });
  });
});
