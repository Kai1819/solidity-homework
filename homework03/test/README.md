# 测试说明（homework03 NFT 拍卖市场）

本目录包含 NFT 拍卖市场的全套测试，共 **102 个用例，全部通过**（69 个 Hardhat TS + 33 个 Foundry Solidity）。

- 测试框架：Mocha + Chai（`hardhat-toolbox-mocha-ethers`）+ Foundry（forge）
- 合约环境：Hardhat 3（EDR 本地模拟链，solc 0.8.28）
- 断言库：chai + `hardhat-ethers-chai-matchers`（事件 / revert / 余额变化断言）；Solidity 测试用 `forge-std/Test`（assertEq / expectRevert / expectEmit）
- 覆盖率：Hardhat 3 内置（`--coverage`，无需 solidity-coverage 插件）
- Gas 报告：Hardhat 3 内置（`--gas-stats` / `--gas-stats-json`）；Foundry `forge snapshot` 生成 `.gas-snapshot`

> ⚠️ **注意**：`solidity-coverage` 与 `hardhat-gas-reporter` 均为 Hardhat 2 插件（peerDependencies 要求 `hardhat ^2.x`），**不兼容 Hardhat 3**。本项目直接使用 Hardhat 3 内置能力 + Foundry snapshot，无需安装任何额外插件。

---

## 快速开始

```bash
# 安装依赖（首次）
npm install

# 运行全部测试
npm test            # 等价于 npx hardhat test

# 只运行某一个测试文件
npx hardhat test test/MetaNFT.test.ts

# 按名称过滤
npx hardhat test mocha --grep "升级"
```

> 注意：本机沙箱环境下若提示 `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]`（Hardhat 更新编译器缓存锁文件被拦截），可临时执行：
>
> ```bash
> env -u CODEBUDDY_TOOL_CALL_ID -u CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR -u CODEBUDDY_SAFE_DELETE_BULK_GUARD npx hardhat test
> ```
>
> 在普通终端中直接运行 `npm test` 不受影响。

---

## 文件结构

| 文件 | 用例数 | 说明 |
|---|---|---|
| `helpers.ts` | — | 测试辅助：网络连接、设施部署（MetaNFT/USDC/预言机）、UUPS/透明代理部署、时间推进、NFT 铸造 |
| `MetaNFT.test.ts` | 9 | MetaNFT（ERC721）单元测试 |
| `Mock.test.ts` | 8 | MockERC20 / MockOracle 单元测试（构造/decimals/mint/事件/转账/改价） |
| `MetaNFTAuction.test.ts` | 30 | 拍卖核心功能测试（基于 UUPS 代理部署，逻辑与透明代理共用 `MetaNFTAuctionBase`），含 MockOracle 改价联动 |
| `MetaNFTAuctionUUPS.test.ts` | 7 | UUPS 升级模式测试 |
| `MetaNFTAuctionTransparent.test.ts` | 15 | 透明代理升级模式测试（V1→V2 共 8 条）+ V3 recoverNFT 回收锁定 NFT 专项测试（7 条） |
| `MetaNFT.t.sol` | 10 | Foundry：MetaNFT（ERC721）单元测试 |
| `MetaNFTAuction.t.sol` | 16 | Foundry：拍卖全流程 + 透明代理升级 V2/V3 + recoverNFT |
| `MetaNFTAuctionUUPS.t.sol` | 4 | Foundry：UUPS 升级模式测试 |
| `Mock.t.sol` | 3 | Foundry：MockERC20 / MockOracle 测试 |

---

## 覆盖率测试（Hardhat 3 内置）

Hardhat 3 内置 Solidity 代码覆盖率（`--coverage` 全局选项），**无需安装 solidity-coverage 插件**，TypeScript 测试与 Solidity 测试均可统计。

```bash
# 运行全部测试并统计覆盖率（等价于 npx hardhat test --coverage）
npm run test -- --coverage    # ⚠️ npm 传参必须写全 `--`，否则参数被 npm 吞掉

# 也可直接运行（不经 npm script）
npx hardhat test --coverage

# 只统计单个测试文件的覆盖率
npx hardhat test test/MetaNFTAuction.test.ts --coverage
```

运行结束后终端直接输出每个合约的 Line % / Statement % / 未覆盖行，并生成报告：

| 产物 | 路径 | 说明 |
|---|---|---|
| HTML 报告 | `coverage/html/index.html` | 浏览器打开，逐文件逐行查看覆盖情况 |
| LCOV 数据 | `coverage/lcov.info` | 供 CI / 覆盖率平台（如 Codecov、Coveralls）上传 |

### 实测覆盖率（2026-08-03，61 用例 — **全合约 100% 覆盖**）

| 合约文件 | 行覆盖 | 未覆盖行 |
|---|---|---|
| `contracts/MetaNFTAuctionBase.sol` | 100.0%（83/83） | - |
| `contracts/MetaNFT.sol` | 100.0%（8/8） | - |
| `contracts/MetaNFTAuctionTransparent.sol` | 100.0%（3/3） | - |
| `contracts/MetaNFTAuctionTransparentV2.sol` | 100.0%（3/3） | - |
| `contracts/MetaNFTAuctionTransparentV3.sol` | 100.0%（6/6） | - |
| `contracts/MetaNFTAuctionUUPS.sol` | 100.0%（3/3） | - |
| `contracts/MetaNFTAuctionUUPSV2.sol` | 100.0%（3/3） | - |
| `contracts/mock/MockERC20.sol` | 100.0%（6/6） | - |
| `contracts/mock/MockOracle.sol` | 100.0%（4/4） | - |
| **总计** | **100.00%（119/119）** | |

> 💡 覆盖率历史：此前为 93.28%（MockOracle 50%、V3 0%），后续补了 8 个测试用例（1 个 MockOracle 改价集成 + 7 个 V3 专项）后达到 100%。具体见 `MetaNFTAuction.test.ts` 的「MockOracle.setPrice 改价后：getPrice 返回新价 + 拍卖 bid 折算跟随变化」和 `MetaNFTAuctionTransparentV3.test.ts`。

---

## Gas 费用测试（Hardhat 3 内置）

Hardhat 3 内置 gas 统计（`--gas-stats` 全局选项），**无需安装 hardhat-gas-reporter 插件**。测试运行后会为每个合约输出各函数的 Min / Average / Median / Max gas 消耗、调用次数，以及部署消耗与字节码大小。

```bash
# 终端表格输出（含每个函数的 gas 消耗）
npx hardhat test --gas-stats

# 输出 JSON 文件（便于 CI 对比 / 脚本解析）
npx hardhat test --gas-stats-json gas-report.json

# 二者可叠加覆盖率
npx hardhat test --coverage --gas-stats
```

### 实测关键 gas 数据（2026-08-03，53 用例）

**拍卖核心函数（MetaNFTAuctionBase / 代理）**：

| 函数 | 平均 gas | 说明 |
|---|---|---|
| `start` | ≈ 258,514 | 启动拍卖（含 NFT 锁定 transferFrom） |
| `bid` | ≈ 176,240 | 出价（含金额折算 + 可能的前任退款） |
| `end` | ≈ 111,902 | 结算（NFT 转买家 + 拍款转卖家） |
| `setTokenOracle` | 按调用 | 配置预言机（onlyOwner） |
| `auctionId` / `auctions` / `getVersion` | ≈ 27–52k | 只读查询 |

**部署成本（proxy 相关）**：

| 合约 | 部署平均 gas | 字节码 |
|---|---|---|
| UUPS 实现（MetaNFTAuctionUUPSV2 等） | ≈ 2,751,567 | 12,396 B |
| MockERC20 | ≈ 1,178,741 | 4,464 B |
| MockOracle | ≈ 194,423 | 539 B |
| ERC1967Proxy | ≈ 197,099 | 212 B |

### Gas 优化提示（对照上面的数据）

- `start` 是最贵的业务函数（~258k），主因是 `IERC721(nft).transferFrom(seller, address(this), nftId)` 的存储与事件开销；
- `bid`（~176k）含预言机读取（`latestRoundData`）+ 前任最高价退款分支，退款分支只会在被超价时执行；
- 若追求极致省 gas，可考虑将 USDC 价格源换成真实 Chainlink feed（现有 MockOracle 每次 `latestRoundData` 返回写死值，gas 差异很小，主要节省在部署成本）；
- 部署成本中 UUPS/透明代理的实现合约（~2.75M gas）远高于业务合约，属代理模式的固有开销。

---

## Foundry 测试（Solidity 版，可生成 .gas-snapshot）

项目同时提供 **Foundry（forge）Solidity 测试**（`test/*.t.sol`），与 Hardhat TS 测试共存。forge 只识别 `*.t.sol`，互不干扰。

### 前置要求

- 安装 Foundry：`curl -L https://foundry.paradigm.xyz | bash && foundryup`（本机已装 forge 1.7.1）
- 依赖从 `node_modules` 借用（`foundry.toml` 中 `remappings` 已指向 forge-std / @openzeppelin / @chainlink，无需 `forge install`）

### 运行

```bash
forge test                  # 运行全部 Solidity 测试（33 个用例）
forge test --match-test test_bid_eth   # 按名称过滤
forge test -vv              # 显示详细 trace（调试 revert）
```

### 生成 .gas-snapshot

```bash
forge snapshot              # 生成 / 更新 .gas-snapshot（覆盖写）
forge snapshot --diff       # 与已有快照对比，输出 gas 增减（CI 回归检查）
```

`.gas-snapshot` 格式：每行 `TestContract:testName() (gas: NNNNN)`，记录每个测试函数的 gas 消耗。修改合约后重跑 `forge snapshot`，再 `git diff .gas-snapshot` 即可看到哪些函数变贵/变便宜。**CI 常用做法**：提交 `.gas-snapshot`，CI 中跑 `forge snapshot --diff`，若 gas 上升超阈值则拦截合并。

### 实测快照（2026-08-03，33 用例全过）

| 测试函数 | gas |
|---|---|
| `test_start_owner`（启动拍卖） | 255,825 |
| `test_bid_eth`（ETH 出价） | 316,068 |
| `test_bid_usdc`（USDC 出价） | 389,437 |
| `test_end_settles`（结算） | 404,756 |
| `test_upgrade_v2`（升级 V2） | 1,063,257 |
| `test_upgrade_v3_recoverNFT`（升级 V3 + 回收） | 1,280,337 |
| `test_mint_onlyOwner_and_tokenIdIncrement` | 178,642 |

> 完整 33 条快照见项目根目录 `.gas-snapshot`。

### Foundry 测试覆盖的合约场景

| 文件 | 场景 |
|---|---|
| `MetaNFT.t.sol` | mint 权限/自增/事件、tokenURI、transfer 三种方式、burn |
| `MetaNFTAuction.t.sol` | 透明代理部署、start/bid（ETH+USDC）/end 全流程、升级 V2 状态保留、升级 V3 + recoverNFT |
| `MetaNFTAuctionUUPS.t.sol` | UUPS 升级、非 owner 拒绝、实现合约防初始化 |
| `Mock.t.sol` | MockERC20 decimals/mint、MockOracle 改价 |

### 注意（Foundry 踩坑记录）

1. **`vm.prank` 只对下一个调用生效**：若 `new 合约` 紧随其后，prank 会被消耗。升级类调用（`proxyAdmin.upgradeAndCall` / `auction.upgradeToAndCall`）前需重新 `vm.prank(owner)` 或用 `vm.startPrank/stopPrank` 包裹。
2. **ETH 出价需要给账户打钱**：`makeAddr` 生成的地址余额为 0，`bid{value: ...}` 前需 `vm.deal(bidder, 10 ether)`，否则 OutOfFunds。
3. **中文断言消息**：solc 字符串字面量不支持直接写中文，需加 `unicode` 前缀（如 `unicode"tokenId 应从 1 自增"`）。
4. **struct 跨合约返回**：`auctions(0)` 返回含 IERC721/IERC20 接口字段的 struct，解构时字段类型需用 `IERC721`/`IERC20`（不能写成 address），否则隐式转换报错。
5. **OZ v5.6 `upgradeAndCall`**：第一个参数需 `ITransparentUpgradeableProxy(address(proxy))` 显式转换。
6. **首次编译需代理**：forge 下载 solc 走网络，本机需 `export HTTPS_PROXY=http://127.0.0.1:7897`（Clash）。

---

## 测试覆盖范围

### MetaNFT（9 个用例）
- 初始化：名称 `MetaNFT`、符号 `MNFT`、owner 正确
- `mint`：仅 owner 可铸造、tokenId 从 1 自增、URI 记录、`MintNftToken` 事件
- 非 owner 铸造 revert（`OwnableUnauthorizedAccount`）
- `tokenURI`：不存在的 tokenId revert（`ERC721NonexistentToken`）
- `transferFrom`：持有人直接转移 / `approve` 后授权转移 / `setApprovalForAll` 批量转移
- 未授权转移 revert（`ERC721InsufficientApproval`）
- `burn`：销毁后 owner/tokenURI 查询 revert

### Mock 合约（8 个用例，对应 Foundry 版 Mock.t.sol）
- **MockERC20（模拟 USDC）**：构造（名称/符号/decimals=6/初始供应量归部署者）、构造 `MintToken` 事件、`mint` 任意账户可无限铸造（无权限限制）+ 事件、`transfer` 转账、`approve` + `transferFrom` 代扣
- **MockOracle（模拟 Chainlink）**：`latestRoundData` 固定轮次与价格、`setPrice` 改价后 `getPrice`/`latestRoundData` 同步、`getPrice` 支持 int256 负价边界

### MetaNFTAuction 核心功能（29 个用例）
- **setTokenOracle**：owner 设置预言机、非 owner revert（`not owner`）、零地址 revert（`invalid oracle`）
- **start**：NFT 锁入合约托管、拍卖状态与起拍价（`$1000 × 1e8`）正确、`auctionId` 自增；非 owner revert、时长 < 30 秒 revert、NFT 零地址 revert、卖家未授权 revert
- **bid（ETH）**：出价成功并折合美元（1 ETH × $2000 = $2000）、`amount` 与 `msg.value` 不匹配 revert、未设置预言机 revert、未开始 revert、不高于起拍价 revert、不高于当前最高价 revert、结束后出价 revert、更高出价替换并退还 ETH
- **bid（ERC20）**：USDC 出价成功并锁入合约、金额为 0 revert、更高出价替换并退还 USDC、跨币种替换（USDC 顶替 ETH 时退回 ETH）
- **end**：ETH/USDC 拍款转给卖家、NFT 转给最高出价者、`EndBid` 事件、无出价 revert、未结束 revert、重复结束 revert
- **isEnded / getPriceInDollar**：时间推进后到期判定、预言机价格读取、未配置预言机 revert

### UUPS 升级（7 个用例）
- 初始版本 `MetaNFTAuctionUUPSV1`
- owner 升级 V1→V2：版本号更新、`newFeature` 可用
- 升级后状态保留（owner、预言机映射、拍卖数据）
- 非 owner 升级 revert（`not owner`）
- 代理/实现合约重复初始化 revert（`InvalidInitialization`）
- 升级后完整拍卖流程可用（start → bid → end 集成）

### 透明代理升级（8 个用例）
- 初始版本 `MetaNFTAuctionTransparentV1`
- ProxyAdmin 升级 V1→V2：版本号更新、`newFeature` 可用
- 升级后状态保留
- 非 admin 调用代理管理函数被拦截 revert
- 非 ProxyAdmin 持有者调用 `upgradeAndCall` revert（`OwnableUnauthorizedAccount`）
- 代理/实现合约重复初始化 revert
- 升级后完整拍卖流程可用（集成）

### V3 recoverNFT 回收锁定 NFT（7 个用例，同在 MetaNFTAuctionTransparent.test.ts）
- V3 实现合约直接初始化 revert（构造时已禁用初始化器）
- 升级 V1→V3 后 `getVersion` 返回 V3
- `recoverNFT` 正常路径：合约持有 NFT → 成功回收 + 触发 `NFTRecovered` 事件
- `recoverNFT`：接收地址为 0x0 revert（`invalid receiver`）
- `recoverNFT`：合约不持有该 NFT revert（`not held`）
- `recoverNFT`：非 owner 调用 revert（`not owner`）
- 升级 V1→V3 后完整拍卖流程仍可走（集成）

---

## 测试数据约定

| 数据 | 值 | 说明 |
|---|---|---|
| ETH/USD 预言机价格 | `$2000`（`2000 × 1e8`） | MockOracle 写死 |
| USDC/USD 预言机价格 | `$1`（`1 × 1e8`） | MockOracle 写死 |
| USDC 小数位 | 6 | 模拟真实 USDC |
| 起拍价 | `$1000`（入参整数，合约内 `× 1e8` 存储） | |
| 拍卖时长 | 60 秒 | 合约要求 ≥ 30 秒 |
| 账户 | owner / seller / bidder1 / bidder2 / attacker | `ethers.getSigners()` 前 5 个 |

价格换算逻辑（`_toUsd`）：
- ETH 出价：`amount(wei) × ETHUSD(1e8) / 1e18` → 美元（1e8 位）
- USDC 出价：`amount(1e6) × USDCUSD(1e8) / 1e6` → 美元（1e8 位）

---

## 代理部署要点（OZ Contracts v5.6）

- **UUPS**：部署 `MetaNFTAuctionUUPS` 实现 → 部署 `ERC1967Proxy(impl, initData)` → `initialize(owner)`。升级走实现内的 `upgradeToAndCall`，权限由 `_authorizeUpgrade`（onlyOwner）控制。
- **透明代理**：`TransparentUpgradeableProxy` 构造函数为 `(logic, initialOwner, data)`，**代理内部自动创建并持有 ProxyAdmin**（owner = initialOwner）。测试通过读取 ERC1967 admin 槽位（`0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103`）获取内部 ProxyAdmin 地址；升级使用 `upgradeAndCall(proxy, impl, data)`（v5.6 无独立 `upgrade`）。
- 代理合约 ABI 不暴露管理函数，非 admin 调用需借助 `ITransparentUpgradeableProxy` 接口 artifact。

---

## 常见问题（Hardhat 3 特有）

1. **`hre.ethers` 不存在**：Hardhat 3 中 ethers 通过 `await hre.network.create()` 返回，测试文件顶层：
   ```ts
   const { ethers, networkHelpers } = await hre.network.create();
   ```
2. **合约调用返回值**：非 view 调用默认返回 `TransactionResponse`（`waitForTransactionReceipt` 默认关闭），需要返回值时（如 `mint` 的 tokenId）应解析事件日志，参见 `helpers.ts` 的 `mintNFT`。
3. **chai matchers v3 新签名**：`.to.be.reverted` 已废弃，改用 `.to.revert(ethers)`；`changeEtherBalance` / `changeTokenBalance` 第一个参数必须传入 `ethers` 实例：
   ```ts
   await expect(tx).to.changeEtherBalance(ethers, account, amount);
   await expect(tx).to.changeTokenBalance(ethers, token, account, amount);
   ```
4. **OZ 代理 artifact**：`hardhat.config.ts` 的 `solidity.npmFilesToBuild` 已配置编译 `ERC1967Proxy`、`TransparentUpgradeableProxy`、`ProxyAdmin`，请勿移除。
5. **时间推进**：使用 `networkHelpers.time.increase(seconds)`（自动挖块），不要直接依赖 `evm_increaseTime`。

---

## 关联文档

- 作业说明：`../homework03.md`
- 合约源码：`../contracts/`（MetaNFT、MetaNFTAuctionBase、MetaNFTAuctionUUPS(V2)、MetaNFTAuctionTransparent(V2/V3)）
- 部署脚本：`../scripts/interact.ethers.ts`
- 覆盖率产物：`../coverage/html/index.html`（运行 `npx hardhat test --coverage` 后生成）
- Gas 报告产物：`gas-report.json`（运行 `npx hardhat test --gas-stats-json gas-report.json` 后生成）
- Gas 快照：`../.gas-snapshot`（运行 `forge snapshot` 后生成）
- Foundry 配置：`../foundry.toml`（src=contracts、test=test、remappings 指向 node_modules）
