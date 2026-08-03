# homework03 项目深度解读（新手友好版）

> 面向零基础读者，循序渐进地拆解一个「NFT 拍卖市场」项目：从 ERC721/ERC20/预言机三大基础规范，到拍卖合约精读、V2/V3 升级、代理模式原理，再到完整实操流程。
> 本解读基于 homework03 仓库内真实代码（Solidity 0.8.28 + Hardhat 3 + OpenZeppelin v5 + Chainlink），逐行讲解，配合图表与示例。
> ⚠️ 本文档已按 homework03 实际合约与 Sepolia 链上状态（2026-08-03 实测，区块 11407408）校对，与源项目 hardhatV3Nft 存在接口差异，请以本文档为准。

---

## 目录

- [第 1 章 项目全景](#第-1-章-项目全景)
- [第 2 章 基础规范：ERC721（MetaNFT.sol）](#第-2-章-基础规范erc721metanftsol)
- [第 3 章 基础规范：ERC20（MockERC20.sol）](#第-3-章-基础规范erc20mockerc20sol)
- [第 4 章 预言机（MockOracle.sol 与 Chainlink 原理）](#第-4-章-预言机mockoraclesol-与-chainlink-原理)
- [第 5 章 拍卖合约精读（MetaNFTAuctionBase.sol）](#第-5-章-拍卖合约精读metanftauctionbasesol)
- [第 6 章 V2 / V3 升级分析](#第-6-章-v2--v3-升级分析)
- [第 7 章 代理模式原理：透明代理 vs UUPS](#第-7-章-代理模式原理透明代理-vs-uups)
- [第 8 章 全流程实操（新手向）](#第-8-章-全流程实操新手向)
- [第 9 章 常见坑位与安全清单](#第-9-章-常见坑位与安全清单)

---

## 第 1 章 项目全景

### 1.1 这个项目在做什么？

一句话：**卖家把 NFT 挂出来，买家可以用 ETH 或 USDC 出价竞拍，价高者得；拍卖过程中使用价格预言机（Chainlink 接口兼容）把不同币种折算成美元，保证「出价金额」可比对**。

完整链路（对应仓库中的模块）：

```
[前端 Next.js + ethers v6]
        │ 用户点击、填表
        ▼
[链上合约]
  MetaNFT.sol                    → NFT 本体（ERC721 + Burnable + Ownable）
  mock/MockERC20.sol             → USDC 测试币（ERC20）
  mock/MockOracle.sol            → 模拟价格预言机（Chainlink 接口兼容）
  MetaNFTAuctionBase.sol         → 拍卖核心逻辑（抽象基类）
  MetaNFTAuctionTransparent.sol  → 拍卖实现 V1（透明代理模式，Sepolia 链上在用）
  MetaNFTAuctionTransparentV2/V3 → 升级演示 V2 / 回收锁定 NFT 的 V3
  MetaNFTAuctionUUPS.sol(+V2)    → UUPS 模式实现合约（演示线）
        │
        ▼
[外部数据源]
  Chainlink 真实喂价（ETH/USD）或 MockOracle（USDC/USD）
```

### 1.2 技术栈速览（为什么是这些？）

| 组件 | 版本 | 作用 |
|---|---|---|
| Hardhat | ^3.x | 编译 / 测试 / 部署 / 脚本运行框架 |
| Solidity | 0.8.28 | 智能合约语言 |
| OpenZeppelin Contracts | ^5.x | ERC721 / ERC20 / 可升级代理 / 访问控制等标准实现 |
| @chainlink/contracts | ^1.x | Chainlink 价格 Feed 接口（AggregatorV3Interface） |
| ethers | ^6.x | JavaScript 库，前端 / 脚本 / 测试与链交互 |
| Hardhat Ignition | ^3.x | 声明式部署与升级管理（部署「蓝图」） |
| Mocha + Chai | - | 测试框架与断言库 |

### 1.3 目录结构地图

```
homework03/
├── contracts/                  # ★ 智能合约源码
│   ├── MetaNFT.sol             #   ERC721 NFT（onlyOwner 铸造，tokenURI 按 id 存储）
│   ├── MetaNFTAuctionBase.sol  #   ★ 拍卖核心逻辑（抽象基类，owner/onlyOwner）
│   ├── MetaNFTAuctionTransparent.sol    #   透明代理实现 V1（Sepolia 当前链上实现）
│   ├── MetaNFTAuctionTransparentV2.sol  #   升级演示 V2（newFeature）
│   ├── MetaNFTAuctionTransparentV3.sol  #   V3（recoverNFT 回收意外锁定 NFT）
│   ├── MetaNFTAuctionUUPS.sol  #   UUPS 模式实现合约
│   ├── MetaNFTAuctionUUPSV2.sol #   UUPS 升级演示
│   └── mock/
│       ├── MockERC20.sol       #   ERC20 USDC 测试币
│       └── MockOracle.sol      #   模拟价格预言机
├── ignition/modules/           # ★ Hardhat Ignition 部署蓝图
│   ├── MetaNFTAuctionTransparent.ts     # 透明代理部署（Sepolia 实际使用）
│   ├── MetaNFTAuctionUUPS.ts            # UUPS 部署（演示线）
│   └── parameters.sepolia.json          # Sepolia 部署参数
├── test/                       # ★ 测试（MetaNFT / 拍卖 / 透明代理 / UUPS）
├── scripts/                    # 链上交互与升级脚本（如 upgrade.recover.ts）
├── hardhat.config.ts           # ★ Hardhat 配置（网络/编译/插件）
├── package.json                # 依赖与脚本
└── README.md                   # 项目说明
```

---

## 第 2 章 基础规范：ERC721（MetaNFT.sol）

### 2.1 ERC721 是什么？（先建立直觉）

- **ERC20** 是「同质化代币」：你的 1 个 USDC 和我的 1 个 USDC 完全等价，可以拆分（0.5 个）。
- **ERC721** 是「非同质化代币（NFT）」：每个 token 有唯一的 `tokenId`，**不可分割、不可互换**。它是房产证、门票、游戏道具这类「独一无二资产」的数字化载体。

ERC721 标准核心接口（OpenZeppelin 实现）包含四组能力：

| 能力 | 核心函数 | 通俗解释 |
|---|---|---|
| 余额/归属 | `balanceOf(owner)` / `ownerOf(tokenId)` | 你手里有几个 / 某个 NFT 现在归谁 |
| 转账 | `transferFrom(from,to,id)` / `safeTransferFrom(...)` | 把某个 NFT 从 A 转到 B |
| 授权 | `approve(operator,id)` / `setApprovalForAll(operator,approved)` | 允许某地址代你转一个 / 代你转全部 |
| 查询授权 | `getApproved(id)` / `isApprovedForAll(owner,operator)` | 查询授权关系 |
| 元数据 | `name()` / `symbol()` / `tokenURI(id)` | 名字 / 代号 / 图片链接等 |

### 2.2 MetaNFT.sol 逐段精读

homework03 的 MetaNFT 与源项目（hardhatV3Nft）有显著差异：

| 差异点 | hardhatV3Nft（源） | homework03（本仓库） |
|---|---|---|
| 继承 | `ERC721` | `ERC721 + ERC721Burnable + Ownable` |
| symbol | `MFT` | **`MNFT`**（链上实测 `symbol()` 返回 "MNFT"） |
| 铸造入口 | 公开 `mint(to,id)` / `mintNext(to)`，任何人可铸 | **`mint(to, tokenURI_) onlyOwner`**，tokenId 合约内自增 |
| tokenURI | 默认拼接 | **按 tokenId 存 `_tokenURIs` 映射**，`tokenURI(id)` 返回存储的 URI |
| 销毁 | 自定义 `burn`（仅 owner） | 直接继承 ERC721Burnable 的 `burn` |
| 事件 | 仅标准 `Transfer` | 额外 `MintNftToken(to, tokenId, tokenURI)` |

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

contract MetaNFT is ERC721, ERC721Burnable, Ownable {
    // 自增Id（从 1 开始）
    uint256 private _netxtId = 1;

    // 一个tokenId对应一个原数据URI
    mapping(uint256 => string) private _tokenURIs;

    // 事件：铸造新 NFT
    event MintNftToken(address indexed to, uint256 indexed tokenId, string tokenURI);

    constructor() ERC721("MetaNFT", "MNFT") Ownable(msg.sender) {}

    // 铸造：仅 owner 可调；tokenId 由合约自增分配，返回新 id
    function mint(address to, string memory tokenURI_) external onlyOwner returns (uint256) {
        uint256 tokenId = _netxtId;
        _mint(to, tokenId);
        _tokenURIs[tokenId] = tokenURI_;
        _netxtId++;
        emit MintNftToken(to, tokenId, tokenURI_);
        return tokenId;
    }

    // 返回某 token 的元数据 URI
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }

    // 销毁 NFT，直接用 ERC721Burnable 的 burn
}
```

### 2.3 字段级讲解

| 字段 | 类型 | 说明 |
|---|---|---|
| `_netxtId` | `uint256 private` | 自增计数器，`mint` 每次给出的 id 唯一不重复（从 1 起） |
| `_tokenURIs` | `mapping(uint256=>string)` | tokenId → 元数据 URI，`tokenURI()` 读它 |
| `owner` | Ownable 状态 | 部署者为 owner，控制 `mint` 权限 |

### 2.4 一个完整示例（理解全流程）

```
场景：管理员给「凯」铸造 MNFT #1，凯再转给「小蓝」，然后小蓝销毁它

1. 铸造：MetaNFT.mint(凯, "ipfs://...")（需管理员签名）
   → 状态：ownerOf(1) = 凯；balanceOf(凯) = 1
   → 事件：MintNftToken(凯, 1, "ipfs://...") + Transfer(0x000...0, 凯, 1)
2. 转账前必须授权：凯 调 approve(小蓝, 1)
   → 状态：getApproved(1) = 小蓝
3. 转账：小蓝 调 transferFrom(凯, 小蓝, 1)
   → 状态：ownerOf(1) = 小蓝；balanceOf(凯) = 0
   → 事件：Transfer(凯, 小蓝, 1)
4. 销毁：小蓝 调 burn(1)（ERC721Burnable，需 owner 或授权）
   → 状态：ownerOf(1) 清空；事件：Transfer(小蓝, 0x000...0, 1)
```

> 💡 **为什么拍卖要授权？** 拍卖合约要把 NFT 从卖家手里「锁」进合约，它需要 `transferFrom(卖家, 拍卖合约, id)`。而 `transferFrom` 要求调用者是被授权者 —— 所以前端流程里必须让卖家先 `setApprovalForAll(拍卖合约地址, true)`。

---

## 第 3 章 基础规范：ERC20（MockERC20.sol）

### 3.1 ERC20 核心接口

| 能力 | 核心函数 | 通俗解释 |
|---|---|---|
| 余额 | `balanceOf(addr)` | 查余额 |
| 转账 | `transfer(to, amount)` | 转给别人 |
| 授权 | `approve(spender, amount)` / `allowance(owner, spender)` | 允许别人替你花「最多这么多」 |
| 代转 | `transferFrom(from, to, amount)` | 被授权者花别人的钱 |
| 元数据 | `name()` / `symbol()` / `decimals()` | 名称 / 代号 / 小数位数 |

### 3.2 MockERC20.sol 逐段精读

```solidity
contract MockERC20 is ERC20, Ownable {
    uint8 private _decimals;
    event MintToken(address indexed to, uint256 amount);

    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 initialSupply_)
        ERC20(name_, symbol_) Ownable(msg.sender)
    {
        _decimals = decimals_;
        _mint(msg.sender, initialSupply_);
        emit MintToken(msg.sender, initialSupply_);
    }

    // 覆盖默认 decimals（默认 18，这里允许自定义，模拟 USDC 的 6 位）
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    // 铸造：公开函数（无 onlyOwner）—— 测试网给用户发「测试 USDC」
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
        emit MintToken(to, amount);
    }
}
```

> 部署实参：`("Mock USDC", "USDC", 6, 100000000000)` —— 链上实测 `name()="Mock USDC"`、`symbol()="USDC"`、`decimals()=6`。

### 3.3 为什么 USDC 是 6 位小数？

现实世界的 USDC 精度是 **6 位小数**（最小单位 0.000001 美元），而标准 ERC20 默认 18 位。这个项目通过 override `decimals()` 精确模拟真实 USDC：

| 代币 | decimals | 1 个代币 = 多少最小单位 |
|---|---|---|
| ETH | 18 | 1 ETH = 10¹⁸ wei |
| 标准 ERC20 | 18 | 10¹⁸ |
| USDC（本项目模拟） | 6 | 10⁶ = 1,000,000 |
| 合约内美元价 | 8 | 10⁸（8 位小数，见第 5 章） |

> 💡 **为什么拍卖里要读 decimals？** 出价金额 `amount` 是「最小单位数」。要把 USDC 数量折算成美元，必须知道「1 个 USDC = 10⁶ 最小单位」，否则换算会错 10¹² 倍。

---

## 第 4 章 预言机（MockOracle.sol 与 Chainlink 原理）

### 4.1 问题背景：合约怎么知道「1 ETH 值多少钱」？

区块链是个「封闭的确定性环境」：合约**无法主动访问互联网**，也看不到外部世界的 ETH 价格。但拍卖必须把 ETH/USDC 出价折算成美元比较，否则「0.01 ETH vs 1100 USDC」没法比大小。

解决方式就是**预言机（Oracle）**：由一个（或一组）外部角色定期把「真实世界的价格」写入链上，合约去读取。

### 4.2 MockOracle.sol 逐段精读

```solidity
contract MockOracle {
    int256 private price;

    constructor(int256 initialPrice_) {
        price = initialPrice_;
    }

    // 关键：实现 Chainlink 的 AggregatorV3Interface 标准签名！
    function latestRoundData()
        external view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return (uint80(1), price, block.timestamp, block.timestamp, uint80(1));
    }

    function setPrice(int256 price_) external { price = price_; }   // 手动改价（模拟波动）
    function getPrice() external view returns (int256) { return price; }
}
```

### 4.3 MockOracle 与真实 Chainlink 的关系（核心原理）

**接口兼容是灵魂**：拍卖合约读取预言机时，把它当成 `AggregatorV3Interface`（Chainlink 定义的标准接口）来调用：

```solidity
AggregatorV3Interface dataFeed = AggregatorV3Interface(oracleAddress);
(, int256 answer, , , ) = dataFeed.latestRoundData();
```

因为 MockOracle 的 `latestRoundData()` **签名与 Chainlink 完全一致**，所以：

- **测试/演示时**：把 MockOracle 地址填进 `setTokenOracle(token, mockOracleAddr)` → 合约读到写死的价格。
- **生产/真实时**：把 **Chainlink 官方 Aggregator Proxy 地址** 填进同一个函数 → 合约读到去中心化预言机网络写入的真实价格。**合约代码一行都不用改！**

这就是「面向接口编程」的威力 —— 合约只依赖接口，不依赖具体实现。

### 4.4 真实 Chainlink 去中心化预言机工作原理

```
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│ Oracle 节点1 │   │ Oracle 节点2 │   │ Oracle 节点3 │  ← 多个独立运行者（去中心化）
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │ 各自从交易所抓价   │               │
       ▼                ▼               ▼
┌────────────────────────────────────────────┐
│            Offchain Aggregator              │  ← 用 OCR 协议聚合
│   (多个节点的价格取中位数，排除异常值)          │
└────────────────────┬───────────────────────┘
                     ▼
┌────────────────────────────────────────────┐
│          Aggregator Proxy（喂价合约）        │  ← 应用合约实际读取的地址
│   latestRoundData() → 最新聚合价格           │
└────────────────────┬───────────────────────┘
                     ▼
┌────────────────────────────────────────────┐
│   MetaNFTAuctionBase.getPriceInDollar()     │  ← 你的合约
└────────────────────────────────────────────┘
```

| 概念 | 说明 |
|---|---|
| 去中心化 | 价格由多个独立节点提供，单个节点作恶/宕机不影响整体 |
| 聚合器（Aggregator） | 多个价格取**中位数**，过滤离群值，防止单点操纵 |
| Proxy 代理地址 | 官方给应用用的固定地址，内部聚合逻辑升级不影响你的合约 |
| 轮次（round） | 价格按固定心跳（如 1 小时）或偏差阈值（如 0.5%）更新 |
| decimals | 价格的小数位，ETH/USD、USDC/USD 均为 8 位（即 1869.05 → 186905000000） |

### 4.5 本项目实际使用的预言机（Sepolia 链上实测 2026-08-03）

| 币种 | 地址 | 类型 | decimals |
|---|---|---|---|
| ETH/USD | `0x694AA1769357215DE4FAC081bf1f309aDC325306` | **真实 Chainlink 喂价**（链上实测 `tokenToOracle[0x0]`） | 8 |
| USDC/USD | `0x1215cC58B60d42728ad7B88F81e349e89e6976dc` | MockOracle（部署模块部署，价格 $1） | 8 |

> 说明：部署模块默认给 ETH/USD 配 MockOracle（`0x08E5…`），但链上实测 ETH 价格源已被前端「⚡ Chainlink 一键」替换为真实 Chainlink 喂价 `0x694A…`（Sepolia 官方 ETH/USD Feed）。USDC 价格源保持 MockOracle（`0x1215…`）。前端 `lib/constants.ts` 内置 Chainlink Sepolia Feed 地址，`SetOracleModal` 有一键写入按钮。

---

## 第 5 章 拍卖合约精读（MetaNFTAuctionBase.sol）

### 5.1 合约设计总览

`MetaNFTAuctionBase` 是**可升级合约的实现逻辑基类**（抽象合约，不直接部署），继承 `Initializable`（OpenZeppelin 可升级初始化机制）。真正的实现合约是 `MetaNFTAuctionTransparent`（继承它）。**注意：与源项目 hardhatV3Nft 不同，权限修饰符是 `onlyOwner`（状态变量 `owner`，非 admin）。**

```
MetaNFTAuctionBase（抽象基类）
├── 状态：owner、tokenToOracle、auctions、auctionId
├── 事件：StartBid / Bid / EndBid
├── 修饰器：onlyOwner
├── 初始化：_initialize（供子类 initializer 调用）
├── 管理：setTokenOracle（配预言机）
├── 拍卖：start（发起）/ bid（出价）/ end（结算）/ isEnded（查询）
└── 价格：getPriceInDollar / _toUsd

MetaNFTAuctionTransparent（实现 V1，Sepolia 链上在用）
├── constructor 中 _disableInitializers
├── initialize(address owner_) initializer
└── getVersion() → "MetaNFTAuctionTransparentV1"
```

### 5.2 状态变量与结构体（字段级逐项讲解）

```solidity
address owner;                                    // 管理员地址（权限控制，private 无 getter）
mapping(address => address) public tokenToOracle; // 每个币种 → 预言机地址

struct Auction {
    IERC721 nft;              // NFT 合约地址
    uint256 nftId;            // 拍卖的 NFT tokenId
    address payable seller;   // 卖家（结算时收款人）
    address highestBidder;    // 当前最高出价者
    uint256 startingTime;     // 拍卖开始时间戳（start() 时写入 = 当前区块时间）
    uint256 duration;         // 拍卖时长（秒）
    IERC20 paymentToken;      // 出价用的代币（address(0) = ETH）
    uint256 startingPriceInDollar;  // 起拍价（美元 × 10⁸）
    uint256 highestBid;       // 当前最高出价（ETH=wei / ERC20=最小单位）
    uint256 highestBidInDollar; // 最高出价折合美元（×10⁸）
    address highestBidToken;  // 最高出价用的代币（address(0) = ETH）
}
mapping(uint256 => Auction) public auctions;  // 拍卖 ID → 拍卖详情
uint256 public auctionId;                     // 下一个拍卖的 ID（自增计数器）
```

> ⚠️ **struct 字段顺序陷阱**：homework03 的字段顺序是 `nft, nftId, seller, highestBidder, startingTime, duration, paymentToken, startingPriceInDollar, highestBid, highestBidInDollar, highestBidToken`（**highestBidder 在 startingTime 之前**）。源项目 hardhatV3Nft 的顺序不同（startingTime 在 highestBidder 之前、paymentToken 更靠后）。**前端 ethers human-readable ABI 必须按 Solidity struct 声明顺序书写**，否则读到的字段全部错位且不报错（homework03 前端 `lib/abis.ts` 已按正确顺序配置）。

**字段逐个解释（新手必看）：**

| 字段 | 为什么要存它 |
|---|---|
| `nft` / `nftId` | 拍卖标的物：哪个合约的哪个 NFT |
| `seller` | 结算时拍款打给谁；`payable` 表示可以接收 ETH |
| `highestBidder` | 当前领先的人；被超价时要给他退款 |
| `startingTime` | 从这一刻开始计时，配合 `duration` 判断是否结束 |
| `startingPriceInDollar` | 美元起拍价（×10⁸），任何出价折算后必须**严格大于**它 |
| `paymentToken` | 本拍卖接受什么币出价（ETH=`address(0)` 或某个 ERC20） |
| `highestBid` | 实际代币数量，用于退款/结算时的准确转账 |
| `highestBidInDollar` | 美元口径，用于「谁更高」的比较（跨币种可比） |
| `highestBidToken` | 记录最高价是哪种币，结算/退款时知道该发哪种 |

### 5.3 事件（Events）

```solidity
event StartBid(uint256 auctionId);                    // 新拍卖启动
event Bid(address indexed sender, uint256 amount);    // 有人出价
event EndBid(uint256 indexed auctionId);              // 拍卖结束
```

前端通过监听/查询这些事件做 UI 刷新；`indexed` 关键字让该字段可被高效过滤检索。（ABI 事件签名只与参数类型有关，前端用 `StartBid(uint256 startingBid)` 声明亦可正常解码。）

### 5.4 初始化：_initialize + _disableInitializers

```solidity
// MetaNFTAuctionBase
function _initialize(address owner_) internal onlyInitializing {
    owner = owner_;
}

// MetaNFTAuctionTransparent（实现合约）
constructor() {
    _disableInitializers();   // 构造函数里锁死：实现合约永远不能再次初始化
}

function initialize(address owner_) public initializer {
    _initialize(owner_);
}
```

**为什么可升级合约要用 initialize 而不是 constructor？**

| 方式 | 问题 |
|---|---|
| constructor 设 owner | 状态写在**实现合约**的存储里；升级到新实现后状态丢失 |
| initialize（initializer） | 状态写在**代理合约**的存储里；升级只换逻辑，状态保留 |

`_disableInitializers()` 是保险：如果有人直接拿实现合约当普通合约部署并调用 initialize，会被拒绝（防「初始化攻击」——攻击者把实现合约初始化后调用自毁函数破坏代理）。

`initializer` 修饰器保证 initialize **只能被调用一次**。

### 5.5 权限：onlyOwner

```solidity
modifier onlyOwner(){
    require(msg.sender == owner, "not owner");
    _;
}
```

**谁有权限：** 只有 `owner`（部署账户）能调带 `onlyOwner` 的函数（start、setTokenOracle）。普通买家只能出价/结算，不能乱启动拍卖。`owner` 变量是 private 无公开 getter，前端通过 ProxyAdmin.owner() 间接判断管理员身份（见 doc/deploy/ProxyAdmin.md）。

### 5.6 配置预言机：setTokenOracle

```solidity
function setTokenOracle(address token, address oracle) external onlyOwner {
    require(oracle != address(0), "invalid oracle");
    tokenToOracle[token] = oracle;
}
```

- `token = address(0)` 表示「ETH」的价格源；
- `token = USDC 地址` 表示 USDC 的价格源。

### 5.7 发起拍卖：start（★ 核心）

```solidity
function start(
    address seller, uint256 nftId, address nft,
    uint256 startingPriceInDollar, uint256 duration, address paymentToken
) external onlyOwner {
    require(nft != address(0), "invalid nft");
    require(duration >= 30, "invalidate duration");
    // ⚠️ 与 hardhatV3Nft 不同：homework03 基类【没有】 require(paymentToken != address(0))
    //    → 从 V1 起就允许 paymentToken = address(0)（ETH 拍卖），无需 V3 升级修复
    Auction storage auction = auctions[auctionId];
    auction.nft = IERC721(nft);
    auction.nftId = nftId;
    auction.seller = payable(seller);
    auction.startingTime = block.timestamp;
    auction.startingPriceInDollar = startingPriceInDollar * 10**8; // 美元 × 10⁸
    auction.duration = duration;
    auction.paymentToken = IERC20(paymentToken);
    auction.highestBid = 0;
    auction.highestBidder = address(0);
    auction.highestBidInDollar = 0;
    auction.highestBidToken = address(0);
    IERC721(nft).transferFrom(seller, address(this), nftId); // ★ NFT 锁进合约
    auctionId++;
    emit StartBid(auctionId);
}
```

**执行逻辑逐行：**

1. 校验：NFT 地址非零、时长 ≥ 30 秒（错误信息拼写为 "invalidate duration"）；
2. 把拍卖信息写入 `auctions[auctionId]`（新拍卖 slot）；
3. **关键动作**：`IERC721(nft).transferFrom(seller, address(this), nftId)` —— 把 NFT 从卖家手里转进拍卖合约，**「锁仓」**保证拍卖期间 NFT 不会被卖家用掉。这里要求卖家**已经授权**过拍卖合约（第 2 章讲过）；
4. `auctionId++` 为下一场拍卖腾出位置；
5. 发事件。

> 💡 **起拍价为什么 ×10⁸？** 前端填整数美元（如 `100`），合约内部统一存 8 位小数美元（`100 × 10⁸ = 10000000000`），与预言机价格的 8 位小数对齐，避免精度丢失。

### 5.8 出价：bid（★ 核心，支持 ETH 与 ERC20 双模式）

```solidity
function bid(uint256 auctionId_, uint256 amount) external payable {
    Auction storage auction = auctions[auctionId_];
    require(auction.startingTime > 0, "not started");
    require(!isEnded(auctionId_), "ended");
    uint256 bidPrice;
    address paymentToken = address(auction.paymentToken);   // 本拍卖的支付代币
    bool isEthBid = msg.value > 0;                          // 带 ETH 就是 ETH 出价
    if (isEthBid) {
        require(amount == msg.value, "amount mismatch");    // 声称金额必须等于实际转的 ETH
        uint256 price = getPriceInDollar(address(0));       // ETH 价格
        bidPrice = _toUsd(amount, 18, price);               // 折算成美元
    } else {
        require(amount > 0, "invalid amount");
        uint256 price = getPriceInDollar(paymentToken);     // 该拍卖的代币价格
        uint8 tokenDecimals = IERC20Metadata(paymentToken).decimals();
        bidPrice = _toUsd(amount, tokenDecimals, price);    // 折算成美元
        IERC20(paymentToken).transferFrom(msg.sender, address(this), amount); // 划走代币
    }
    require(auction.startingPriceInDollar < bidPrice, "invalid startingPrice"); // 高于起拍价
    require(auction.highestBidInDollar < bidPrice, "invalid highestBid");       // 高于当前最高
    if (auction.highestBidder != address(0) && auction.highestBidder != msg.sender) {
        uint256 refundAmount = auction.highestBid;   // 给上一个最高出价者退款
        if (refundAmount > 0) {
            if (auction.highestBidToken == address(0)) {
                payable(auction.highestBidder).transfer(refundAmount);      // 退 ETH
            } else {
                IERC20(paymentToken).transfer(auction.highestBidder, refundAmount); // 退 ERC20
            }
        }
    }
    if (isEthBid) {
        auction.highestBid = msg.value;
        auction.highestBidToken = address(0);
    } else {
        auction.highestBid = amount;
        auction.highestBidToken = paymentToken;
    }
    auction.highestBidder = msg.sender;
    auction.highestBidInDollar = bidPrice;
    emit Bid(msg.sender, msg.value);
}
```

**流程拆解（分五步）：**

```
① 校验状态：拍卖已启动 && 未结束
② 折算美元：ETH → msg.value × ETH价 / 10¹⁸；ERC20 → amount × 代币价 / 10^decimals
③ 校验金额：折算后必须 > 起拍价 且 > 当前最高价
④ 退还上一任最高出价者（ETH 或 ERC20 原路退回）
⑤ 更新状态：新最高价者 / 金额 / 美元价，发 Bid 事件
```

**字段级要点：**

| 校验 | 含义 | 为什么 |
|---|---|---|
| `amount == msg.value` | ETH 出价时，声称值与实际转账必须一致 | 防止「虚报金额」 |
| `startingPriceInDollar < bidPrice` | 严格高于起拍价 | 起拍价是「底价」 |
| `highestBidInDollar < bidPrice` | 严格高于当前最高 | 保证每轮价格上升 |
| 被超价则退款 | 上一任的资金退回 | 保证只锁定「当前最高价那份钱」 |

### 5.9 查询：isEnded

```solidity
function isEnded(uint256 auctionId_) public view returns (bool) {
    Auction storage auction = auctions[auctionId_];
    return auction.startingTime > 0 && block.timestamp >= auction.startingTime + auction.duration;
}
```

拍卖开始后，当前时间 ≥ 开始时间 + 时长 → 结束。

### 5.10 结算：end（★ 核心）

```solidity
function end(uint256 auctionId_) external {
    Auction storage auction = auctions[auctionId_];
    require(isEnded(auctionId_), "not ended");
    require(auction.highestBidder != address(0), "no bids");
    auction.nft.transferFrom(address(this), auction.highestBidder, auction.nftId); // NFT → 买家
    if (auction.highestBid > 0) {
        if (auction.highestBidToken == address(0)) {
            payable(auction.seller).transfer(auction.highestBid);   // 拍款 → 卖家（ETH）
        } else {
            IERC20(auction.highestBidToken).transfer(auction.seller, auction.highestBid); // 拍款 → 卖家（ERC20）
        }
    }
    emit EndBid(auctionId_);
}
```

**结算两步：**

1. `nft.transferFrom(this, highestBidder, nftId)`：把锁在合约里的 NFT 转给最高出价者；
2. 把 `highestBid`（代币）转给卖家（注意：按 `highestBidToken` 判断币种，ETH 用 `transfer`，ERC20 用 `IERC20(highestBidToken).transfer`）。

> ⚠️ **已知缺陷**：若 `highestBidder == address(0)`（无人出价），`end()` 会 revert —— 无人出价的拍卖**永远无法手动结束**，NFT 锁死在合约里。前端对这种情况显示「ended-no-bid 只读警示」。（homework03 已通过 V3 的 `recoverNFT()` 提供管理员回收通道，见第 6 章。）

### 5.11 价格读取：getPriceInDollar + _toUsd（★ 预言机集成核心）

```solidity
function getPriceInDollar(address token) public view returns (uint256) {
    AggregatorV3Interface dataFeed;
    address oracle = tokenToOracle[token];
    require(oracle != address(0), "oracle not set");   // 没配预言机直接报错
    dataFeed = AggregatorV3Interface(oracle);          // 把地址当 Chainlink 接口用
    (, int256 answer, , , ) = dataFeed.latestRoundData();
    return uint256(answer);
}

// 把「代币最小单位数量」折算成「美元 × 10⁸」
function _toUsd(uint256 amount, uint256 amountDecimals, uint256 price)
    internal pure returns (uint256) {
    uint256 scale = 10 ** amountDecimals;
    uint256 usd = (amount * price) / scale;   // 例：1 ETH(10¹⁸ wei) × 1869×10⁸ / 10¹⁸ = 1869×10⁸
    return usd;
}
```

**换算示例（与链上 auction#0 实测对照）：**

| 场景 | 计算 | 结果（美元×10⁸） |
|---|---|---|
| 出价 0.01 ETH（=10¹⁶ wei），ETH 价 $1869 | 10¹⁶ × 186905000000 / 10¹⁸ | 1869×10⁴ = $18.69 |
| 出价 111 USDC（=111×10⁶），USDC 价 $1 | 111×10⁶ × 100000000 / 10⁶ | 111×10⁸ = $111.00（链上 `highestBidInDollar=11100000000`） |

### 5.12 getVersion

```solidity
// MetaNFTAuctionTransparent（V1）
function getVersion() external pure virtual returns (string memory) {
    return "MetaNFTAuctionTransparentV1";
}
```

用于链上自检当前实现版本（V2/V3 覆盖它），前端据此展示升级状态。Sepolia 链上实测 `getVersion() = "MetaNFTAuctionTransparentV1"`。

---

## 第 6 章 V2 / V3 升级分析

> ⚠️ **与源项目 hardhatV3Nft 的版本语义不同**：源项目的 V3 是「修复 ETH 支付」；homework03 的基类**从 V1 起就允许 ETH 支付**（无 `paymentToken != 0` 校验），因此 V3 的实际内容是 **`recoverNFT()` 回收意外锁定 NFT**。

### 6.1 V2：MetaNFTAuctionTransparentV2.sol —— 演示「如何做一次升级」

```solidity
contract MetaNFTAuctionTransparentV2 is MetaNFTAuctionTransparent {
    function newFeature() external pure returns (string memory) {
        return "This is a new feature in V2";
    }
    function getVersion() external pure virtual override returns (string memory) {
        return "MetaNFTAuctionTransparentV2";
    }
}
```

| 升级点 | 内容 | 解决了什么 |
|---|---|---|
| `getVersion()` | 返回 `MetaNFTAuctionTransparentV2` | 链上可区分实现版本 |
| `newFeature()` | 新增纯函数 | 演示「升级后可调用新函数」 |

**V2 的实际作用：** 教学演示 —— 证明「代理升级后，旧数据（如 auctionId）保留、新函数可用」。

### 6.2 V3：MetaNFTAuctionTransparentV3.sol —— 回收意外锁定 NFT

```solidity
contract MetaNFTAuctionTransparentV3 is MetaNFTAuctionTransparent {
    event NFTRecovered(address indexed nft, uint256 indexed tokenId, address indexed to);

    function getVersion() external pure virtual override returns (string memory) {
        return "MetaNFTAuctionTransparentV3";
    }

    // 回收合约当前持有的 NFT（仅 owner 可调，管理员急救通道）
    function recoverNFT(address nft, uint256 tokenId, address to) external onlyOwner {
        require(to != address(0), "invalid receiver");
        require(IERC721(nft).ownerOf(tokenId) == address(this), "not held"); // 校验合约确实持有
        IERC721(nft).transferFrom(address(this), to, tokenId);
        emit NFTRecovered(nft, tokenId, to);
    }
}
```

**背景**：拍卖合约只会在 `start()` 时把 NFT 锁入（`transferFrom` 到合约），且只有存在对应 auctionId 记录时 `end()` 才能解锁。若发生「NFT 已转入合约但 auctions 无记录 / 无人出价无法 end()」等异常状态，NFT 会永久锁死在合约里。V3 的 `recoverNFT()` 允许 owner 回收这类历史遗留资产。

| 升级点 | 解决的问题 |
|---|---|
| `recoverNFT(nft, tokenId, to)` | 管理员可把「不属于任何有效拍卖」的锁定 NFT 取回 |
| 前置校验 `ownerOf(tokenId) == address(this)` | 只回收合约真正持有的 NFT，避免误转他人资产 |

> 📌 homework03 曾于 2026-08-02 通过透明代理从 V1 升级到 V3 完成一次 NFT 回收（详见 `doc/update/Upgrade_Recover.md`，当时代理为 `0xc551…`；其后 2026-08-03 重新部署，当前 Sepolia 代理 `0x825Eaa…` 的实现为 V1）。

> 💡 **两条版本线的区别**：透明代理线 = `MetaNFTAuctionTransparent`（V1）→ V2 → V3；UUPS 线 = `MetaNFTAuctionUUPS` → `MetaNFTAuctionUUPSV2`（仅演示）。两条线的业务逻辑几乎一致，**区别在升级机制**（见第 7 章）。

---

## 第 7 章 代理模式原理：透明代理 vs UUPS

### 7.1 为什么要可升级？为什么不能直接改合约？

区块链上的合约代码**一经部署不可修改**。但业务要迭代（修 bug、加功能）。解决方案：**代理模式（Proxy Pattern）** —— 把「数据」和「逻辑」分离：

```
用户永远访问：Proxy（代理合约，地址永不变）
                     │  delegatecall（委托调用）
                     ▼
              Implementation（实现合约，可更换 V1→V2→V3）
```

- 用户地址 = Proxy 地址（前端配置、资产绑定都不变）；
- 状态数据存在 Proxy 的存储里；
- 每次升级 = 部署新实现 + 把 Proxy 指向新实现。**数据无损，地址不变**。

### 7.2 delegatecall 原理（一分钟理解）

`delegatecall` 和普通 `call` 的区别：

| | call | delegatecall |
|---|---|---|
| 执行代码位置 | 目标合约 | 目标合约 |
| 读写状态的位置 | 目标合约自己的存储 | **调用者的存储** |
| msg.sender | 调用者 | **保持不变（还是用户）** |

所以 Proxy 用 delegatecall 让实现合约的代码「在 Proxy 的存储上运行」→ 状态都落在 Proxy → 换实现不影响数据。

### 7.3 透明代理（Transparent Proxy）—— 本项目主用模式（Sepolia 链上在用）

```
                 ┌────────────────────────────────┐
用户 ───────────► │ TransparentUpgradeableProxy     │
                 │  (存储数据，逻辑委托给实现)       │
                 └──────────┬─────────────────────┘
                            │ delegatecall
                            ▼
                 ┌────────────────────────────────┐
                 │ Implementation (MetaNFTAuctionTransparent) │
                 │  V1 → V2 → V3 可替换            │
                 └────────────────────────────────┘

管理员升级路径（走 ProxyAdmin，不冲突）：
管理员 ──► ProxyAdmin（独立合约，owner 可升级）──► 修改 Proxy 指向的新实现
```

**核心机制：**

| 组件 | 角色 |
|---|---|
| `TransparentUpgradeableProxy` | 所有用户调用都打到这里；根据调用者身份决定「走管理逻辑」还是「走业务逻辑」 |
| `ProxyAdmin` | 独立的升级管理合约，只有它的 owner 能调 `upgradeAndCall()` 升级（OZ v5.6 构造代理时自动创建，地址存于 EIP-1967 admin 槽） |
| `Implementation` | 实际业务逻辑（V1/V2/V3） |

**「透明」的含义：** 如果 `msg.sender` 是 ProxyAdmin 的 owner（管理员），Proxy 会拦截其调用（只允许走管理函数）；其他用户则正常走业务函数。这样**同一个函数名不会出现歧义**。

**优点：**
- 升级权限清晰（ProxyAdmin.owner 管升级，业务 owner 管业务）；
- 对使用者（普通用户）完全透明，无需关心升级机制。

**缺点：**
- 每次调用多一层身份判断，gas 略高；
- ProxyAdmin 由代理构造时自动创建（EIP-1967 槽位可查，详见 `doc/deploy/ProxyAdmin.md`）。

### 7.4 UUPS 模式（UUPSUpgradeable）—— 项目另一条线

```
                 ┌────────────────────────────────┐
用户 ───────────► │ Proxy（数据存储）                │
                 └──────────┬─────────────────────┘
                            │ delegatecall
                            ▼
                 ┌────────────────────────────────┐
                 │ Implementation (MetaNFTAuctionUUPS) │
                 │  ★ 自带 upgradeTo() 升级函数     │
                 │  ★ 自带 _authorizeUpgrade 权限检查│
                 └────────────────────────────────┘
```

**核心差异：升级函数住在实现合约里**

```solidity
contract MetaNFTAuctionUUPS is Initializable, MetaNFTAuctionBase, UUPSUpgradeable {
    // 升级权限控制：只有 owner 能升级
    function _authorizeUpgrade(address) internal override onlyOwner {}
}
```

| 对比项 | 透明代理 | UUPS |
|---|---|---|
| 升级函数位置 | 独立 ProxyAdmin 合约 | 实现合约本身（`upgradeTo`） |
| 升级权限 | ProxyAdmin.owner | 实现合约内 `_authorizeUpgrade`（本项目是 owner） |
| 每笔调用开销 | 略高（身份判断） | 略低（普通调用无额外分支） |
| 合约体积 | 逻辑实现可稍小 | 实现合约需内嵌升级代码（稍大） |
| 复杂度 | 多一个 ProxyAdmin 要部署/管理 | 升级权限逻辑自己写 |
| 若忘记授权 | 无关 | 无法升级（升级能力被锁死） |

### 7.5 本项目怎么选？

| 部署模块 | 模式 | 用途 |
|---|---|---|
| `MetaNFTAuctionTransparent.ts` | **透明代理** | ★ 主部署：实现 + Proxy + 自动 ProxyAdmin + initialize + 注册预言机（Sepolia 在用） |
| `MetaNFTAuctionUUPS.ts` | **UUPS** | 演示 UUPS 写法（另有测试对照） |

**Sepolia 链上实际部署（2026-08-03 实测，区块 11407408）：**

| 组件 | 地址 |
|---|---|
| 代理 TransparentUpgradeableProxy（= 拍卖合约入口） | `0x825Eaa7654782b4275EacbfbB61Cc03688e935DB` |
| 实现 V1（当前） | `0xB356dEbb2672F2f387e4b8EdadDd2F86d6AF11E0` |
| ProxyAdmin（EIP-1967 admin 槽位读出） | `0xa73d460512d34752d4d3e178f382ecd57d025b9a` |
| MetaNFT | `0xE24e475F44f168090Dd0cC9b52ebe515f7a5f720` |
| MockUSDC | `0xAA7F0E4294da18a32068F51C387b157b60Fa45b4` |
| ETH/USD 预言机（真实 Chainlink） | `0x694AA1769357215DE4FAC081bf1f309aDC325306` |
| USDC/USD 预言机（MockOracle） | `0x1215cC58B60d42728ad7B88F81e349e89e6976dc` |
| 管理员（部署账户 / ProxyAdmin.owner） | `0x4E284945f747922ccFf68622deE247c2E834fE75` |

---

## 第 8 章 全流程实操（新手向）

> 本仓库使用 **Hardhat 3**（注意：与 Hardhat 2 的 API 有差异，例如网络连接用 `hre.network.connect()`、配置变量用 `configVariable()`）。

### 8.0 前置环境

| 工具 | 版本建议 | 验证命令 |
|---|---|---|
| Node.js | ≥ 20（仓库用 22.22.2） | `node -v` |
| npm | ≥ 10 | `npm -v` |
| （可选）git | - | `git --version` |

### 8.1 安装依赖

```bash
cd homework03
npm install
```

### 8.2 编译合约

```bash
npx hardhat compile
```

### 8.3 运行测试（本地模拟链）

```bash
# 全量测试
npx hardhat test
```

**测试覆盖了什么（对照第 5 章）：** 当前 5 个测试文件（MetaNFT / MetaNFTAuction / MetaNFTAuctionTransparent / MetaNFTAuctionUUPS / helpers），此前全量结果为 **53 passing**（见 doc/update/Upgrade_Recover.md 第 5 节）。

| 测试组 | 断言 | 对应合约逻辑 |
|---|---|---|
| getVersion | 返回对应版本字符串 | 5.12 |
| getPriceInDollar | ETH/USDC 价格 > 0 | 5.11 |
| initialize | 二次初始化 revert（`InvalidInitialization`） | 5.4 |
| start | 非 owner 被拒（`not owner`）；auctionId 递增 | 5.7 |
| bid | 已结束 revert；低价被拒；多人出价后 highestBidder/highestBid 正确 | 5.8 |
| upgrade | 升级后 auctionId 保留 / getVersion 更新 / newFeature 可用 | 第 6、7 章 |

> 如果出现 `HHE506 argument not consumed`：npm 传参必须用 `--` 分隔，例如 `npm run test -- --network sepolia`（npm 会吞掉 `--` 后面的参数，必须显式写全 `--`）。

### 8.4 配置 .env（测试网需要）

```bash
# .env（不要提交到 git！）
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<你的key>
SEPOLIA_PRIVATE_KEY=0x你的私钥
SEPOLIA_ETHERSCAN_API_KEY=你的etherscan密钥（可选）
```

> ⚠️ **网络代理提示**：如果直连国外 RPC 不稳，可 `export HTTPS_PROXY=http://127.0.0.1:7897`（Clash 默认端口），Hardhat 3 原生支持代理。

### 8.5 部署到 Sepolia 测试网

```bash
# 透明代理部署（主部署模块）
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionTransparent.ts --network sepolia
```

部署内容（Ignition 自动按序执行）：
1. MetaNFT（ERC721）
2. MockERC20（USDC，6 位小数，参数 `usdcDecimals/usdcInitialSupply`）
3. MockOracle ×2（ETH/USD 与 USDC/USD，参数 `ethUsdPrice/usdcUsdPrice`）
4. MetaNFTAuctionTransparent 实现合约
5. TransparentUpgradeableProxy（OZ v5.6：`(logic, initialOwner, data)`，内部自动创建 ProxyAdmin，admin = 部署账户）
6. `setTokenOracle ×2`（把 ETH 与 USDC 预言机注册进拍卖合约）

**Sepolia 部署参数（ignition/modules/parameters.sepolia.json）：**

| 参数 | 值 | 说明 |
|---|---|---|
| `usdcDecimals` | 6 | USDC 小数位 |
| `usdcInitialSupply` | 100000000000 | 初始供应量（含小数位） |
| `ethUsdPrice` | 200000000000 | ETH/USD = $2000（8 位小数） |
| `usdcUsdPrice` | 100000000 | USDC/USD = $1（8 位小数） |

### 8.6 链上验证（部署后必做）

```bash
# 读版本/拍卖ID/详情/价格
npx hardhat run scripts/interact.ethers.ts --network sepolia
```

预期输出要点：`合约版本: MetaNFTAuctionTransparentV1`、`当前拍卖ID: N`、拍卖详情字段、`ETH 价格(美元)` 等（2026-08-03 实测 `auctionId()=1`）。

**链上手动验证代理指向（ERC1967 实现槽）：**

```bash
# 读 Proxy 的 ERC1967 implementation 槽（0x360894...）
cast storage 0x825Eaa7654782b4275EacbfbB61Cc03688e935DB \
  0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc \
  --rpc-url https://sepolia.infura.io/v3/<你的key>
# 预期 = 0xB356dEbb2672F2f387e4b8EdadDd2F86d6AF11E0（V1 实现）
```

### 8.7 升级演示（V2 / V3）

升级需通过 ProxyAdmin 执行 `upgradeAndCall(proxy, newImpl, data)`（OZ v5.6，data 传空 `0x`）。homework03 提供脚本 `scripts/upgrade.recover.ts`（升级到 V3 + 回收 NFT，见 `doc/update/Upgrade_Recover.md`）：

```bash
# 本地验证（hardhatMainnet 完整流程断言）
npx hardhat run scripts/upgrade.recover.ts --network hardhatMainnet
# Sepolia 真实执行
npx hardhat run scripts/upgrade.recover.ts --network sepolia
```

### 8.8 Etherscan 验证源码（可选但推荐）

```bash
npx hardhat verify --network sepolia <实现合约地址>
```

### 8.9 Gas 消耗与覆盖率（进阶）

```bash
REPORT_GAS=true npx hardhat test   # 若接入 gas-reporter
npx hardhat coverage               # 若接入 solidity-coverage
```

### 8.10 前端跑起来（可选）

```bash
cd frontend
npm install
npm run dev        # 打开 http://localhost:3000
```

- `/setup`：一键部署辅助合约（MetaNFT/USDC/Oracle）并配置价格源；
- `/admin`：启动拍卖、设置价格源（含 Chainlink 一键）；
- `/auction/[id]`：双模式出价；
- `/assets`：我的 NFT 与参与记录。

前端环境变量（frontend/.env.local，2026-08-03 实测配置）：

| 变量 | 值 |
|---|---|
| `NEXT_PUBLIC_AUCTION_ADDRESS` | `0x825Eaa7654782b4275EacbfbB61Cc03688e935DB`（透明代理） |
| `NEXT_PUBLIC_PROXY_ADMIN_ADDRESS` | `0xa73d460512d34752d4d3e178f382ecd57d025b9a` |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | `0x4E284945f747922ccFf68622deE247c2E834fE75` |
| `NEXT_PUBLIC_CHAIN_ID` | `11155111` |
| `NEXT_PUBLIC_META_NFT_ADDRESS` | `0xE24e475F44f168090Dd0cC9b52ebe515f7a5f720` |
| `NEXT_PUBLIC_USDC_ADDRESS` | `0xAA7F0E4294da18a32068F51C387b157b60Fa45b4` |

---

## 第 9 章 常见坑位与安全清单

### 9.1 本项目踩过的坑（实操笔记）

| # | 现象 | 根因 | 解决 |
|---|---|---|---|
| 1 | `/assets` 报 `range 11396668 exceeds limit of 10000` | `eth_getLogs` 从区块 0 扫到 latest 超 RPC 单次上限 | 前端 `chunkedGetLogs` 分块 + 二分缩窗 |
| 2 | USDC 出价 `require(false)`（无 message） | ETH 拍卖（paymentToken=0x0）却用 USDC 出价 → 合约在零地址调 `decimals()` revert | 出价模式必须与拍卖支付代币一致 |
| 3 | 详情页 `a.nftId.toString()` 报 undefined | ethers v6 `Result` 不能 spread（spread 只展开索引键） | `toAuctionView` 显式 named 重建 |
| 4 | `npx hardhat test --network sepolia` 本地用例混入测试网 | 网络守卫缺失 | 测试里按 `networkName` 判断 `this.skip()` |
| 5 | `HHE7 Configuration Variable not found` | Hardhat 3 不自动加载 .env | `import "dotenv/config"` + `.env` 配置 |
| 6 | 部署对账失败 `reconciliation failed` | 换了部署账户导致参数变化 | `--reset` 重新部署（会清空旧记录） |
| 7 | NFT 永久锁死在合约里（无拍卖记录 / 无人出价） | `end()` 只认 auctions 记录且无出价会 revert | 升级 V3 用 `recoverNFT()` 回收（管理员急救通道） |
| 8 | 前端读拍卖字段全错位（startingTime=0、duration 超大数） | ethers human-readable ABI 字段顺序与 Solidity struct 不一致 | ABI 必须按 struct 声明顺序书写（见 5.2 陷阱） |

### 9.2 安全清单（新手对照）

- [ ] 私钥绝不提交 git（`.env` 已在 `.gitignore`）；
- [ ] `SEPOLIA_PRIVATE_KEY` 带 `0x` 前缀；
- [ ] 生产环境用真实 Chainlink 喂价，不用 MockOracle 写死价；
- [ ] 启动拍卖前卖家必须 `setApprovalForAll` 授权，否则 `transferFrom` revert；
- [ ] `end()` 无人出价会 revert → 前端只读警示，不要以为能「取消」；异常锁定资产走 V3 `recoverNFT`；
- [ ] 升级时**不要**对升级模块加 `--reset`（会清空部署记录导致 Proxy 变孤儿）；
- [ ] 部署账户余额充足（Sepolia 可用 Chainlink faucet 领测试 ETH）。

---

*本解读基于 homework03 仓库实际代码（2026-08-01 快照），合约地址与链上状态为 Sepolia 2026-08-03 实测（区块 11407408）。*
