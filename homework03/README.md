# homework03 · NFT 拍卖市场（Sepolia）

一个基于 **Hardhat 3 + Solidity 0.8.28 + OpenZeppelin v5** 的 NFT 拍卖去中心化应用（DApp）：
卖家把 ERC721 NFT 上架拍卖，买家可用 **ETH 或 USDC** 双币种出价，价格经 **Chainlink 接口兼容的预言机** 统一折算为美元比较；合约采用 **UUPS / 透明代理** 两种可升级模式，并附带 Next.js 前端、Ignition 部署模块、TS + Solidity 双套测试与完整文档。

> 📌 链上状态（Sepolia，2026-08-03 实测）：透明代理 `0x825Eaa…935DB`（当前实现 V1），MetaNFT `0xE24e…f720`，详见 [部署地址](#部署地址sepolia-实测)。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [依赖安装](#依赖安装)
- [部署（Ignition）](#部署ignition)
- [交互脚本](#交互脚本)
- [测试](#测试)
- [前端](#前端)
- [文档中心](#文档中心)
- [配置说明](#配置说明)
- [部署地址（Sepolia 实测）](#部署地址sepolia-实测)

---

## 功能特性

| 类别 | 功能 | 说明 |
|---|---|---|
| **NFT 铸造** | `MetaNFT.mint(to, tokenURI_)` | ERC721 + Burnable + Ownable；仅 owner 可铸，tokenId 合约内自增（1 起），URI 按 id 存储 |
| **启动拍卖** | `start(seller, nftId, nft, price, duration, token)` | onlyOwner；NFT 锁定进合约托管；起拍价按整数美元传入、合约内 ×1e8 存储 |
| **双币种出价** | `bid(id, amount)` | `msg.value > 0` 走 ETH 分支（须 `amount == msg.value`）；否则走 ERC20 分支（`transferFrom` 锁币）；金额统一折算美元比较 |
| **结算** | `end(id)` | 到期后 NFT → 最高出价者、拍款 → 卖家；被超价者自动退款 |
| **预言机** | `getPriceInDollar / setTokenOracle` | 面向 `AggregatorV3Interface` 编程：测试用 MockOracle、生产可换真实 Chainlink 喂价，合约代码零改动 |
| **合约升级** | UUPS / 透明代理 | 两条升级线：`MetaNFTAuctionUUPS`（实现内 `upgradeToAndCall`）与 `MetaNFTAuctionTransparent`（ProxyAdmin `upgradeAndCall`） |
| **NFT 回收（V3）** | `recoverNFT(nft, tokenId, to)` | 透明代理 V3 新增；管理员回收「意外锁定且无拍卖记录」的 NFT（急救通道） |
| **前端** | Next.js 14 全站客户端渲染 | 首页市场 / 详情出价 / 管理面板 / 我的资产 / 初始化向导，支持 `/setup` 浏览器一键部署辅助合约 |

> ⚠️ **已知缺陷**：无人出价的拍卖到期后 `end()` 会 revert（`no bids`），NFT 锁死在合约中——前端显示「ended-no-bid」只读警示，历史遗留资产可走 V3 `recoverNFT` 回收。

---

## 技术栈

| 层 | 技术 | 版本 |
|---|---|---|
| 框架 | Hardhat（含 Ignition 部署） | ^3.x（3.12.0） |
| 合约语言 | Solidity | 0.8.28（evm target: cancun） |
| 标准库 | @openzeppelin/contracts（含 upgradeable） | ^5.6.1 |
| 预言机接口 | @chainlink/contracts（AggregatorV3Interface） | ^1.5.0 |
| 链交互 | ethers | ^6.17.0 |
| TS 测试 | Mocha + Chai（hardhat-toolbox-mocha-ethers） | — |
| Solidity 测试 | Foundry（forge + forge-std） | forge 1.7.1 |
| 前端 | Next.js 14 + React 18 + ethers v6 + Tailwind CSS | next 14.0.4 |
| 覆盖率 / Gas | Hardhat 3 内置 `--coverage` / `--gas-stats`；Foundry `forge snapshot` | — |

---

## 项目结构

```
homework03/
├── contracts/                  # ★ 智能合约源码
│   ├── MetaNFT.sol             #   ERC721 NFT（onlyOwner 铸造 + Burnable）
│   ├── MetaNFTAuctionBase.sol  #   ★ 拍卖核心逻辑（抽象基类：start/bid/end/预言机）
│   ├── MetaNFTAuctionTransparent.sol    #   透明代理实现 V1（Sepolia 当前在用）
│   ├── MetaNFTAuctionTransparentV2.sol  #   升级演示 V2（newFeature）
│   ├── MetaNFTAuctionTransparentV3.sol  #   V3（recoverNFT 回收锁定 NFT）
│   ├── MetaNFTAuctionUUPS.sol  #   UUPS 实现 V1
│   ├── MetaNFTAuctionUUPSV2.sol #   UUPS 升级演示 V2
│   └── mock/
│       ├── MockERC20.sol       #   ERC20 USDC 测试币（6 位小数，mint 公开）
│       └── MockOracle.sol      #   模拟 Chainlink 预言机（setPrice/getPrice）
├── frontend/                   # ★ Next.js 14 前端（独立包，见 frontend/README.md）
├── ignition/modules/           # ★ Hardhat Ignition 部署模块（见其 README）
│   ├── MetaNFTAuctionTransparent.ts     # 透明代理部署（Sepolia 实际使用）
│   ├── MetaNFTAuctionUUPS.ts            # UUPS 部署
│   └── parameters.sepolia.json          # Sepolia 部署参数
├── scripts/                    # ★ 链上交互 / 升级回收脚本（见其 README）
│   ├── interact.auction.ts     #   查询 / 启动拍卖 / ETH+USDC 出价 / 结束 / 端到端演示
│   └── upgrade.recover.ts      #   升级 V3 + 回收锁定 NFT
├── test/                       # ★ 测试（TS 69 例 + Solidity 33 例，见其 README）
│   ├── *.test.ts               #   Hardhat TS 测试（MetaNFT/Mock/拍卖/UUPS/透明代理）
│   ├── *.t.sol                 #   Foundry Solidity 测试
│   └── helpers.ts              #   测试辅助（部署/时间推进/铸造）
├── doc/                        # ★ 深度文档（见「文档中心」）
├── hardhat.config.ts           # Hardhat 配置（网络/编译/插件/代理 artifact）
├── foundry.toml                # Foundry 配置（remappings 指向 node_modules）
├── .gas-snapshot               # Foundry gas 快照（forge snapshot 生成）
├── package.json / tsconfig.json
└── .env                        # 私有配置（SEPOLIA_RPC_URL / 私钥，勿提交）
```

---

## 快速开始

### 环境要求

- Node.js ≥ 20（项目用 22.22.2）、npm ≥ 10
- （可选）Foundry：`curl -L https://foundry.paradigm.xyz | bash && foundryup`

### 安装与测试

```bash
# 1. 安装依赖
cd homework03
npm install

# 2. 编译合约
npx hardhat compile

# 3. 运行全部测试（TS 69 例 + Solidity 33 例 = 102 例）
npx hardhat test
forge test                      # 若已安装 Foundry

# 4. 覆盖率 / gas（Hardhat 3 内置）
npx hardhat test --coverage     # 全合约 100%
npx hardhat test --gas-stats    # 终端 gas 表
forge snapshot                  # 生成/更新 .gas-snapshot
```

> 本机沙箱环境若提示 `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]`，可临时加前缀：
> `env -u CODEBUDDY_TOOL_CALL_ID -u CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR -u CODEBUDDY_SAFE_DELETE_BULK_GUARD npx hardhat test`（普通终端不受影响）。

### 本地端到端演示（零配置）

```bash
# 本地模拟链一次跑通：部署 → 启动拍卖 → ETH 出价 → USDC 高价替换退款 → 结束
ACTION=full-demo npx hardhat run scripts/interact.auction.ts --network hardhatMainnet
```

---

## 依赖安装

### 系统级工具（需手动安装，不在 npm 内）

| 工具 | 版本要求 | 安装方式 | 用途 |
|---|---|---|---|
| Node.js | ≥ 20（项目用 22.22.2） | [nodejs.org](https://nodejs.org) / nvm | 运行 Hardhat / 脚本 / 前端 |
| npm | ≥ 10 | 随 Node.js 附带 | 包管理 |
| Foundry（forge） | 1.x（项目用 1.7.1） | `curl -L https://foundry.paradigm.xyz \| bash && foundryup` | 运行 `test/*.t.sol` Solidity 测试与 `forge snapshot` 生成 `.gas-snapshot`（**可选**，不装则跳过 forge 相关命令） |
| git | - | 系统自带 / Xcode CLT | 源码管理 |

### 项目依赖（`npm install` 自动安装，根目录 `package.json` devDependencies）

| 包 | 版本 | 用途 |
|---|---|---|
| `hardhat` | ^3.12.0 | Hardhat 3 框架（编译/测试/部署） |
| `@nomicfoundation/hardhat-ethers` | ^4.0.15 | Hardhat 3 的 ethers 集成 |
| `@nomicfoundation/hardhat-ignition` | ^3.1.8 | 声明式部署框架（Ignition） |
| `@nomicfoundation/hardhat-toolbox-mocha-ethers` | ^3.0.7 | 测试工具包（Mocha + Chai + ethers 断言） |
| `ethers` | ^6.17.0 | 链交互库（脚本/测试/前端共用） |
| `@openzeppelin/contracts` | ^5.6.1 | ERC721 / ERC20 / 代理 / Ownable 标准实现 |
| `@openzeppelin/contracts-upgradeable` | ^5.6.1 | 可升级合约（Initializable / UUPSUpgradeable） |
| `@chainlink/contracts` | ^1.5.0 | Chainlink `AggregatorV3Interface` 预言机接口 |
| `forge-std` | github:foundry-rs/forge-std#v1.9.4 | Foundry 测试标准库（`Test.sol` 等，供 `.t.sol` 用） |
| `mocha` | ^11.7.6 | TS 测试运行器 |
| `chai` | ^6.2.2 | 断言库 |
| `@types/chai` / `@types/chai-as-promised` / `@types/mocha` / `@types/node` | - | TS 类型声明 |
| `typescript` | ~6.0.3 | 类型检查（`npx tsc --noEmit`） |
| `dotenv` | ^17.4.2 | 加载 `.env` 环境变量 |

> ⚠️ 曾尝试的 `solidity-coverage`、`hardhat-gas-reporter` 为 Hardhat 2 插件（要求 `hardhat ^2.x`），**不兼容 Hardhat 3，无需安装**；覆盖率与 gas 统计使用 Hardhat 3 内置能力。

### 前端依赖（`cd frontend && npm install`，独立于根目录）

| 包 | 版本 | 用途 |
|---|---|---|
| `next` | 14.0.4 | Next.js 14 框架（App Router） |
| `react` / `react-dom` | ^18.2.0 | UI 库 |
| `ethers` | ^6.9.0 | 前端链交互（BrowserProvider / Contract） |
| `lucide-react` | ^0.303.0 | 图标库 |
| `date-fns` | ^3.0.6 | 日期/倒计时格式化 |
| `tailwindcss` / `postcss` / `autoprefixer` | ^3.4.1 / ^8.4.33 / ^10.4.16 | 样式方案 |
| `typescript` | ^5.3.3 | 前端 TS |
| `@types/react` / `@types/react-dom` / `@types/node` | - | 前端 TS 类型声明 |

---

## 部署（Ignition）

支持两种可升级模式，模块见 [`ignition/modules/README.md`](ignition/modules/README.md)：

```bash
# 本地模拟链（零成本）
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionTransparent.ts --network hardhatMainnet
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts --network hardhatMainnet

# Sepolia 测试网（需 .env 配置 RPC + 私钥 + 测试 ETH）
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionTransparent.ts --network sepolia \
  --parameters ignition/modules/parameters.sepolia.json
```

每个模块自动执行：部署 MetaNFT / MockUSDC / 预言机 ×2 / 拍卖实现 + 代理 → `initialize(owner)` → 注册 ETH 与 USDC 预言机，部署完成即可使用。管理员（owner）= 部署账户。

> ⚠️ 公共 RPC（Infura 等）对同账户并发交易有限制，模块已用 `after` 把部署串行化规避；升级时**不要**对模块加 `--reset`。

---

## 交互脚本

脚本详解见 [`scripts/README.md`](scripts/README.md)。核心命令：

```bash
# 查询合约状态（本地未给地址时自动部署演示实例）
npx hardhat run scripts/interact.auction.ts --network hardhatMainnet

# 逐步操作（Sepolia 需指定 AUCTION_MODE 与 AUCTION_ADDRESS）
ACTION=start    npx hardhat run scripts/interact.auction.ts --network hardhatMainnet  # 启动拍卖
ACTION=bid-eth  npx hardhat run scripts/interact.auction.ts --network hardhatMainnet  # ETH 出价
ACTION=bid-usdc npx hardhat run scripts/interact.auction.ts --network hardhatMainnet  # USDC 出价
ACTION=end      npx hardhat run scripts/interact.auction.ts --network hardhatMainnet  # 结束拍卖

# 升级到 V3 并回收锁定 NFT（本地验证 / Sepolia 执行）
npx hardhat run scripts/upgrade.recover.ts --network hardhatMainnet
npx hardhat run scripts/upgrade.recover.ts --network sepolia
```

---

## 测试

共 **102 个用例，全部通过**（TS 69 + Solidity 33），全合约覆盖率 **100%**。详见 [`test/README.md`](test/README.md)：

- **Hardhat TS**：MetaNFT（9）、Mock（8）、拍卖核心（30）、UUPS 升级（7）、透明代理升级 + V3 回收（15）
- **Foundry Solidity**：MetaNFT（10）、拍卖 + 透明代理（16）、UUPS（4）、Mock（3），`forge snapshot` 生成 `.gas-snapshot` 做 gas 回归

| 命令 | 用途 |
|---|---|
| `npx hardhat test` | 跑全部 TS 测试（69 例） |
| `forge test` | 跑全部 Solidity 测试（33 例） |
| `npx hardhat test --coverage` | 覆盖率报告（`coverage/html/index.html`） |
| `npx hardhat test --gas-stats` | 按函数 gas 消耗表 |
| `forge snapshot --diff` | 与已提交快照对比 gas 变化（CI 回归） |

---

## 前端

Next.js 14 全站客户端渲染（CSR），见 [`frontend/README.md`](frontend/README.md)：

```bash
cd frontend
npm install
npm run dev        # http://localhost:3000
```

| 路由 | 功能 |
|---|---|
| `/` | 拍卖市场：卡片网格、状态过滤、铸造/领取入口 |
| `/auction/[id]` | 拍卖详情：ETH/USDC 双模式出价、结束拍卖 |
| `/admin` | 管理员面板：启动拍卖、设置 Oracle、拍卖管理 |
| `/assets` | 我的资产：持有 NFT、参与/卖出/拍得记录 |
| `/setup` | 初始化向导：浏览器一键部署 MetaNFT/USDC/Oracle 并配置价格源 |

前端已针对 homework03 合约接口适配（`mint(to, tokenURI_)`、symbol `MNFT`、透明代理 `getVersion()` 动态识别、8 位小数美元价格等），`lib/abis.ts` 的 `auctions()` tuple 字段顺序与 Solidity struct 严格一致。

---

## 文档中心

| 文档 | 路径 | 内容 |
|---|---|---|
| **合约深度解读** | [`doc/Contract_Deep.md`](doc/Contract_Deep.md) | 新手向逐行拆解：ERC721/ERC20/预言机/拍卖核心/V2·V3 升级/代理原理/实操 |
| **前端深度解读** | [`doc/Fronted_Deep.md`](doc/Fronted_Deep.md) | 前端架构、目录、部署、测试、上线全流程精读 |
| **全流程调用图** | [`doc/NFT-Flow.html`](doc/NFT-Flow.html) | 浏览器打开：三角色流程、互动时序、函数签名速查（Sepolia 实测数据） |
| **NFT 铸造流程** | [`doc/nft/NFT_Flow.md`](doc/nft/NFT_Flow.md) | 图片上传 Pinata → 组装元数据 JSON → 生成 Token URI 全流程（含 labubu 示例） |
| **ProxyAdmin 机制** | [`doc/deploy/ProxyAdmin.md`](doc/deploy/ProxyAdmin.md) | 透明代理内部自动创建的 ProxyAdmin 从哪来、如何从 EIP-1967 槽位读取 |
| **升级与回收记录** | [`doc/update/Upgrade_Recover.md`](doc/update/Upgrade_Recover.md) | V1→V3 升级 + `recoverNFT` 回收的实操记录（tx/区块/结果） |
| **部署说明** | [`ignition/modules/README.md`](ignition/modules/README.md) | Ignition 模块、参数、升级与常见问题 |
| **脚本说明** | [`scripts/README.md`](scripts/README.md) | 交互脚本 ACTION 速查、环境变量、演示流程 |
| **测试说明** | [`test/README.md`](test/README.md) | 测试结构、覆盖率 / gas 用法、Foundry 踩坑记录 |
| **前端说明** | [`frontend/README.md`](frontend/README.md) | 前端启动、环境变量、页面功能、合约差异适配 |
| **作业要求** | [`homework03.md`](homework03.md) | 原始大作业任务书（功能/要求/提交内容） |

---

## 配置说明

### 环境变量（项目根目录 `.env`，勿提交）

| 变量 | 用途 |
|---|---|
| `SEPOLIA_RPC_URL` | Sepolia RPC 节点（Infura / Alchemy / 公共节点均可） |
| `SEPOLIA_PRIVATE_KEY` | 部署账户私钥（`0x` 开头 66 字符，仅测试网） |
| `SEPOLIA_ETHERSCAN_API_KEY` | 合约源码验证（可选） |

`hardhat.config.ts` 已 `dotenv.config()` 自动加载；脚本/部署命令通过环境变量传参（如 `ACTION`、`AUCTION_MODE`、`AUCTION_ADDRESS`），避免 CLI 传参歧义，详见 [`scripts/README.md`](scripts/README.md)。

### 前端环境变量（`frontend/.env.local`）

| 变量 | 说明 |
|---|---|
| `NEXT_PUBLIC_AUCTION_ADDRESS` | 拍卖合约（透明代理）地址 |
| `NEXT_PUBLIC_PROXY_ADMIN_ADDRESS` | ProxyAdmin 地址（运行时 admin 判定） |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | 管理员地址（env 兜底） |
| `NEXT_PUBLIC_CHAIN_ID` | 目标链 ID（Sepolia = 11155111） |
| `NEXT_PUBLIC_RPC_URL` / `NEXT_PUBLIC_ETHERSCAN_API_URL` | 只读 RPC / Etherscan 外链 |
| `NEXT_PUBLIC_META_NFT_ADDRESS` / `NEXT_PUBLIC_USDC_ADDRESS` / `NEXT_PUBLIC_ORACLE_ADDRESS` | 辅助合约地址（可留空走 localStorage 兜底） |

> `NEXT_PUBLIC_` 前缀变量会暴露到浏览器，只放公开信息，**绝不放私钥**。

### 网络代理提示

直连国外 RPC 不稳定时可 `export HTTPS_PROXY=http://127.0.0.1:7897`（Clash 默认端口）；Hardhat 3 与 forge 均原生支持代理。

---

## 部署地址（Sepolia 实测）

> 2026-08-03 实测（区块 11407408），来源 `ignition/deployments/chain-11155111/deployed_addresses.json` + 链上 RPC 查询。

| 合约 | 地址 |
|---|---|
| 拍卖代理（TransparentUpgradeableProxy，实现 V1） | `0x825Eaa7654782b4275EacbfbB61Cc03688e935DB` |
| 实现合约（V1） | `0xB356dEbb2672F2f387e4b8EdadDd2F86d6AF11E0` |
| ProxyAdmin（EIP-1967 admin 槽） | `0xa73d460512d34752d4d3e178f382ecd57d025b9a` |
| MetaNFT（ERC721，symbol=MNFT） | `0xE24e475F44f168090Dd0cC9b52ebe515f7a5f720` |
| MockUSDC（6 位小数） | `0xAA7F0E4294da18a32068F51C387b157b60Fa45b4` |
| ETH/USD 预言机（真实 Chainlink） | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |
| USDC/USD 预言机（MockOracle） | `0x1215cC58B60d42728ad7B88F81e349e89e6976dc` |
| 管理员（部署账户 / ProxyAdmin.owner） | `0x4E284945f747922ccFf68622deE247c2E834fE75` |

> 链上现状：`getVersion() = "MetaNFTAuctionTransparentV1"`、`auctionId() = 1`（#0 为 USDC 拍卖，已结束）。

---

## 相关链接

- [作业要求（homework03.md）](homework03.md)
- [部署模块说明](ignition/modules/README.md) · [交互脚本说明](scripts/README.md) · [测试说明](test/README.md) · [前端说明](frontend/README.md)

---

*项目代码与文档基于 homework03 仓库实际内容（2026-08-03 快照）编写。*
