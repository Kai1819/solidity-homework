# Solidity Homework

Solidity 智能合约作业合集（大作业三件套），覆盖 **基础语法 → 算法实现 → 完整 DApp（合约升级 + 预言机 + 前端）** 三个阶段。

## 项目地址

https://github.com/Kai1819/solidity-homework.git

## 作业总览

| 作业 | 主题 | 开发环境 | 目录 | 状态 |
|---|---|---|---|---|
| 作业 1 | Solidity 基础语法 + LeetCode 算法题（投票合约 / 字符串反转 / 罗马数字 / 数组 / 二分查找） | Remix IDE | [homework01/](homework01/) | ✅ 完成 |
| 作业 2 | 讨饭合约（BeggingContract）：收款 / 捐赠记录 / 仅 owner 提现 | Remix IDE | [homework02/](homework02/) | ✅ 完成 |
| 作业 3 | NFT 拍卖市场：ERC721 铸造 + 双币种拍卖 + Chainlink 预言机 + UUPS/透明代理升级 + Next.js 前端 | Hardhat 3 | [homework03/](homework03/) | ✅ 完成（Sepolia 已部署） |

## 使用说明

1. 每个作业有对应目录和 Markdown 文件描述（`homework01.md` / `homework02.md` / `homework03.md`）。
2. 作业 1 和作业 2 在 **Remix IDE** 开发，可以直接导入对应 `.sol` 文件编译部署。
3. 作业 3 使用 **Hardhat 3** 开发，查看 [homework03/README.md](homework03/README.md) 了解完整安装、部署与测试流程。

---

## 各作业详情

### 作业 1：Solidity 基础（homework01）

> 任务书：[homework01.md](homework01/homework01.md) ｜ 合约源码：Voting.sol / Voting2.sol / Normal.sol

| 文件 | 内容 |
|---|---|
| `Voting.sol` | 投票合约 v1：`mapping` 存票数、`vote` / `getVotes` / `resetVotes`（每人全选周期限一票） |
| `Voting2.sol` | 投票合约 v2：升级为「每人对每候选人限一票」（二维映射），支持重置后重新投票 |
| `Normal.sol` | 6 道算法题：字符串反转、罗马数字↔整数互转、合并两个有序数组、二分查找 |

### 作业 2：讨饭合约（homework02）

> 任务书：[homework02.md](homework02/homework02.md) ｜ 合约源码：Begging.sol

- `donate()`：payable 收款并记录捐赠者金额，带 7 天时间限制（额外挑战）
- `withdraw()`：仅 owner 可提取全部余额（`address.transfer`）
- `getDonation()`：查询指定地址捐赠额；`Donation` 事件记录每笔捐赠

### 作业 3：NFT 拍卖市场（homework03）

> 主 README：[homework03/README.md](homework03/README.md) ｜ 任务书：[homework03.md](homework03/homework03.md)

完整 DApp（Hardhat 3 + Solidity 0.8.28 + OZ v5.6 + Chainlink + Next.js 14）：

- **合约**：`MetaNFT`（ERC721 + Burnable）、`MetaNFTAuctionBase`（start / bid(ETH+USDC) / end / 预言机折算美元）、UUPS 与透明代理双升级线（V1→V2→V3，V3 含 `recoverNFT` 回收）
- **测试**：102 例全过（Hardhat TS 69 + Foundry Solidity 33），覆盖率 100%，`forge snapshot` 生成 `.gas-snapshot`
- **部署**：Ignition 模块（UUPS / 透明代理），Sepolia 链上已部署（代理 `0x825Eaa…935DB`）
- **前端**：Next.js 14 拍卖平台（市场 / 出价 / 管理 / 资产 / setup 向导）
- **文档**：合约/前端深度解读、全流程调用图、ProxyAdmin 机制、升级回收记录（见 `doc/`）

---

## 目录结构

```
solidity-homework/
├── README.md              # 本文档（总览）
├── .gitignore             # 仓库忽略规则（含 homework03 项目规则）
├── homework01/            # 作业 1：Solidity 基础 + 算法
│   ├── homework01.md      # 任务书
│   ├── Voting.sol         # 投票合约 v1
│   ├── Voting2.sol        # 投票合约 v2
│   └── Normal.sol         # 6 道算法题
├── homework02/            # 作业 2：讨饭合约
│   ├── homework02.md      # 任务书
│   └── Begging.sol        # 讨饭合约
└── homework03/            # 作业 3：NFT 拍卖市场（Hardhat 项目，详见其 README）
    ├── README.md          # 项目主 README
    ├── homework03.md      # 任务书
    ├── contracts/         # 智能合约（MetaNFT / 拍卖核心 / UUPS / 透明代理 / mock）
    ├── frontend/          # Next.js 前端
    ├── ignition/          # Hardhat Ignition 部署模块
    ├── scripts/           # 链上交互脚本
    ├── test/              # 测试（TS + Solidity）
    └── doc/               # 深度文档
```

## 技术栈汇总

| 阶段 | 技术 |
|---|---|
| 作业 1 / 2 | Solidity 0.8.28（Remix IDE） |
| 作业 3 | Hardhat 3 · Solidity 0.8.28 · OpenZeppelin v5.6 · Chainlink · ethers v6 · Foundry · Next.js 14 · Tailwind CSS |

---

*仓库快照：2026-08-03*
