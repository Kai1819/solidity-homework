import { expect } from "chai";
import type { Signer } from "ethers";
import type { MetaNFT } from "../types/ethers-contracts/index.js";
import { ethers } from "./helpers.js";

/**
 * MetaNFT 单元测试
 * 覆盖：铸造（权限/自增 ID/URI/事件）、元数据查询、授权与转移、销毁
 */
describe("MetaNFT（ERC721 拍卖原始 NFT）", () => {
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let nft: MetaNFT;

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    nft = await (await ethers.getContractFactory("MetaNFT")).deploy();
  });

  it("初始化：名称、符号与 owner 正确", async () => {
    expect(await nft.name()).to.equal("MetaNFT");
    expect(await nft.symbol()).to.equal("MNFT");
    expect(await nft.owner()).to.equal(await owner.getAddress());
  });

  it("mint：owner 铸造成功，tokenId 从 1 自增，URI 正确，发出 MintNftToken 事件", async () => {
    const aliceAddr = await alice.getAddress();
    await expect(nft.connect(owner).mint(aliceAddr, "ipfs://meta/1"))
      .to.emit(nft, "MintNftToken")
      .withArgs(aliceAddr, 1n, "ipfs://meta/1");
    expect(await nft.ownerOf(1n)).to.equal(aliceAddr);
    expect(await nft.tokenURI(1n)).to.equal("ipfs://meta/1");
    // 下一次铸造 tokenId 自增
    await nft.connect(owner).mint(aliceAddr, "ipfs://meta/2");
    expect(await nft.ownerOf(2n)).to.equal(aliceAddr);
    expect(await nft.tokenURI(2n)).to.equal("ipfs://meta/2");
  });

  it("mint：非 owner 调用 revert（OwnableUnauthorizedAccount）", async () => {
    await expect(nft.connect(alice).mint(await alice.getAddress(), "ipfs://meta/1"))
      .to.be.revertedWithCustomError(nft, "OwnableUnauthorizedAccount");
  });

  it("tokenURI：不存在的 tokenId revert（ERC721NonexistentToken）", async () => {
    await expect(nft.tokenURI(99n)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
  });

  it("transferFrom：持有人可直接转移 NFT", async () => {
    const aliceAddr = await alice.getAddress();
    const bobAddr = await bob.getAddress();
    await nft.connect(owner).mint(aliceAddr, "ipfs://meta/1");
    await nft.connect(alice).transferFrom(aliceAddr, bobAddr, 1n);
    expect(await nft.ownerOf(1n)).to.equal(bobAddr);
  });

  it("approve + transferFrom：被授权者可以转移 NFT", async () => {
    const aliceAddr = await alice.getAddress();
    const bobAddr = await bob.getAddress();
    await nft.connect(owner).mint(aliceAddr, "ipfs://meta/1");
    await nft.connect(alice).approve(bobAddr, 1n);
    await expect(nft.connect(bob).transferFrom(aliceAddr, bobAddr, 1n))
      .to.emit(nft, "Transfer")
      .withArgs(aliceAddr, bobAddr, 1n);
    expect(await nft.ownerOf(1n)).to.equal(bobAddr);
  });

  it("setApprovalForAll：操作员可批量转移 NFT", async () => {
    const aliceAddr = await alice.getAddress();
    const bobAddr = await bob.getAddress();
    await nft.connect(owner).mint(aliceAddr, "ipfs://meta/1");
    await nft.connect(owner).mint(aliceAddr, "ipfs://meta/2");
    await nft.connect(alice).setApprovalForAll(bobAddr, true);
    await nft.connect(bob).transferFrom(aliceAddr, bobAddr, 1n);
    await nft.connect(bob).transferFrom(aliceAddr, bobAddr, 2n);
    expect(await nft.ownerOf(1n)).to.equal(bobAddr);
    expect(await nft.ownerOf(2n)).to.equal(bobAddr);
  });

  it("transferFrom：未授权转移 revert（ERC721InsufficientApproval）", async () => {
    const aliceAddr = await alice.getAddress();
    const bobAddr = await bob.getAddress();
    await nft.connect(owner).mint(aliceAddr, "ipfs://meta/1");
    await expect(nft.connect(bob).transferFrom(aliceAddr, bobAddr, 1n))
      .to.be.revertedWithCustomError(nft, "ERC721InsufficientApproval");
  });

  it("burn：销毁 NFT 后，owner/tokenURI 查询 revert（ERC721NonexistentToken）", async () => {
    const aliceAddr = await alice.getAddress();
    await nft.connect(owner).mint(aliceAddr, "ipfs://meta/1");
    await expect(nft.connect(alice).burn(1n)).to.emit(nft, "Transfer").withArgs(aliceAddr, ethers.ZeroAddress, 1n);
    await expect(nft.ownerOf(1n)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
    await expect(nft.tokenURI(1n)).to.be.revertedWithCustomError(nft, "ERC721NonexistentToken");
  });
});
