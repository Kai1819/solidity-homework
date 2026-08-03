# 合约升级与 NFT 回收操作记录

> 日期：2026-08-02
> 网络：Sepolia 测试网（chainId 11155111）
> 项目：homework03（Hardhat 3 / Solidity 0.8.28 / OpenZeppelin v5.6 透明代理）

---

## 1. 背景与问题

homework03 的拍卖合约以**透明代理**方式部署（代理地址 `0xc551E7718663Bf2fF0Df4bFcdDb7d8975117a070`，当前实现 V1）。

排查「启动拍卖失败」时发现链上存在异常状态：

| 项 | 值 | 说明 |
|---|---|---|
| `auctionId()` | `0` | `auctions` 映射中无任何拍卖记录 |
| `ownerOf(1)` | `0xc551…5070`（拍卖代理本身） | tokenId 1 被锁在合约里 |
| `ownerOf(2)` | `0xc551…5070`（拍卖代理本身） | tokenId 2 被锁在合约里 |
| 管理员 `balanceOf` | `0` | 管理员账户不持有 NFT |

**问题本质**：NFT（tokenId 1、2）已转入拍卖合约，但 `auctions` 中没有对应记录（历史遗留，无拍卖记录或中间操作中断）。合约的 `end()` 只认 `auctions` 记录，因此这些 NFT **永久锁定、无法通过正常流程取回**。

**解决方案**：通过透明代理升级到新增了 `recoverNFT()` 的 V3 实现，由管理员把锁定的 NFT 回收。

---

## 2. 方案设计

### 2.1 升级合约（V3）

文件：`contracts/MetaNFTAuctionTransparentV3.sol`

继承链：`MetaNFTAuctionTransparentV3` → `MetaNFTAuctionTransparent`（V1）→ `MetaNFTAuctionBase`

```solidity
contract MetaNFTAuctionTransparentV3 is MetaNFTAuctionTransparent {
    event NFTRecovered(address indexed nft, uint256 indexed tokenId, address indexed to);

    function getVersion() external pure virtual override returns (string memory) {
        return "MetaNFTAuctionTransparentV3";
    }

    function recoverNFT(address nft, uint256 tokenId, address to) external onlyOwner {
        require(to != address(0), "invalid receiver");
        require(IERC721(nft).ownerOf(tokenId) == address(this), "not held");
        IERC721(nft).transferFrom(address(this), to, tokenId);
        emit NFTRecovered(nft, tokenId, to);
    }
}
```

**关键设计**：
- `recoverNFT` 为 `onlyOwner`（管理员专属，复用基类 `owner` 状态）
- 先校验 `ownerOf(tokenId) == address(this)`，确认合约确实持有该 NFT 才转出，避免误转他人资产
- 升级是**状态保留**的：owner、预言机映射 `tokenToOracle`、`auctions` 均不丢失，代理地址不变
- ⚠️ 仅供回收「无拍卖记录的锁定资产」；正常拍卖中的 NFT 不可使用（会破坏拍卖流程）

### 2.2 操作脚本

文件：`scripts/upgrade.recover.ts`

| 模式 | 用途 | 命令 |
|---|---|---|
| 本地验证 | 完整流程断言（部署→锁 NFT→升级 V3→回收→校验 owner） | `npx hardhat run scripts/upgrade.recover.ts --network hardhatMainnet` |
| Sepolia 执行 | 真实链升级 + 回收 | `npx hardhat run scripts/upgrade.recover.ts --network sepolia` |

Sepolia 模式可配置环境变量（默认值已指向 homework03 已部署合约）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `AUCTION_ADDRESS` | `0xc551…070` | 拍卖代理地址 |
| `PROXY_ADMIN_ADDRESS` | `0x9dcb…bc2` | ProxyAdmin（OZ v5.6 代理内部自动创建） |
| `NFT_ADDRESS` | `0x9601…8d40` | MetaNFT 地址 |
| `RECOVER_TO` | `.env` 私钥账户 | 回收接收地址（默认管理员） |
| `TOKEN_IDS` | `1,2` | 待回收 tokenId 列表 |

---

## 3. 操作步骤

### 3.1 本地验证（hardhatMainnet）

```bash
npx hardhat run scripts/upgrade.recover.ts --network hardhatMainnet
```

脚本自动执行并断言：部署 V1 代理 → 铸造并锁定 NFT → 升级到 V3 → `recoverNFT` 回收 → 校验 `ownerOf` 回到管理员。输出 `✅ 本地验证通过` 即逻辑正确。

### 3.2 Sepolia 实际执行

```bash
npx hardhat run scripts/upgrade.recover.ts --network sepolia
```

⚠️ 会消耗真实 gas（共 4 笔交易：部署 V3 实现 + 升级 + 每 NFT 各 1 笔回收）。

---

## 4. 执行结果（Sepolia，2026-08-02）

| 步骤 | 合约 / 交易 | 区块 |
|---|---|---|
| 部署 V3 实现 | `0xB4bCd74305eE2a69518c803ca4f83a3Ce09BC289` | — |
| 代理升级（`ProxyAdmin.upgradeAndCall(proxy, impl, 0x)`） | `0x1f962fb4522542a8987a4c6eec7a9ae4288f0a90be9acbda607de37c186a6043` | 11404057 |
| 回收 NFT #1 | `0xc1a9b6d090da34b0984321cfb1f2e3a73fd3c39c646e5c3608b34dc9956ba3fc` | 11404058 |
| 回收 NFT #2 | `0x9a2686c459b43d6ab8e9e14317366999363e32e51637d7cdb411c4b47ff0e2d7` | 11404059 |

**回收结果**：

```
NFT #1 → 0x4E284945f747922ccFf68622deE247c2E834fE75（管理员）
NFT #2 → 0x4E284945f747922ccFf68622deE247c2E834fE75（管理员）
```

### 升级后链上状态

- 代理地址不变：`0xc551E7718663Bf2fF0Df4bFcdDb7d8975117a070`
- 实现版本：`MetaNFTAuctionTransparentV3`
- owner / 预言机映射 / 拍卖数据全部保留

---

## 5. 验证

| 项 | 结果 |
|---|---|
| 本地模拟链全流程断言 | ✅ 通过 |
| `npx hardhat test`（53 用例） | ✅ 53 passing，无回归 |
| `npx tsc --noEmit` | ✅ 0 错误 |
| Sepolia 回收后 `ownerOf(1)` / `ownerOf(2)` | ✅ 均为管理员地址 |

---

## 6. 注意事项

1. `recoverNFT` 是管理员的**急救通道**，仅用于清理无拍卖记录的锁定资产；正常拍卖中的 NFT 不可调用，否则破坏拍卖流程。
2. 升级通过 `ProxyAdmin.upgradeAndCall(proxy, newImpl, "0x")` 完成（OZ v5.6 ProxyAdmin 无独立 `upgrade`，data 传空 `0x` 即可）。
3. 回收的 NFT 现归管理员所有，可直接用于后续启动拍卖（前端 `/admin` 会自动列出管理员持有的 NFT ID）。
4. 若需从**前端 UI** 调用 `recoverNFT`，需在 `frontend/lib/abis.ts` 的拍卖合约 ABI 中补充该函数签名（本次未做，仅通过脚本执行）。

---

## 相关文件

- 升级合约：`contracts/MetaNFTAuctionTransparentV3.sol`
- 操作脚本：`scripts/upgrade.recover.ts`
- 脚本文档：`scripts/README.md`（4.8 节）
- 本文档：`doc/update/Upgrade_Recover.md`
