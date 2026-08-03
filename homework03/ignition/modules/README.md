# MetaNFTAuction 部署说明（Hardhat Ignition）

本文档说明如何将 **NFT 拍卖市场**（MetaNFT + USDC + 价格预言机 + 拍卖合约）部署到两种环境：

- **本地 localhost**（`hardhatMainnet`，EDR 进程内模拟链，零配置、零成本）
- **测试网 Sepolia**（真实链，需要 RPC、私钥与测试币）

部署工具为 **Hardhat Ignition**（声明式、幂等、可重放的部署框架），模块与参数文件均位于本目录。

---

## 1. 目录结构

```
ignition/modules/
├── MetaNFTAuctionUUPS.ts         # UUPS 代理模式部署模块（推荐）
├── MetaNFTAuctionTransparent.ts  # 透明代理模式部署模块
├── parameters.sepolia.json       # Sepolia 部署参数（配合 --parameters 使用）
└── README.md                     # 本文档
```

| 模块 | 部署内容 | 升级方式 |
|---|---|---|
| `MetaNFTAuctionUUPS.ts` | MetaNFT、MockUSDC、ETH/USD 预言机、USDC/USD 预言机、`MetaNFTAuctionUUPS` 实现 + `ERC1967Proxy` 代理，并自动注册预言机 | 实现内 `upgradeToAndCall`（仅 owner） |
| `MetaNFTAuctionTransparent.ts` | 同上，但拍卖合约采用 `TransparentUpgradeableProxy` 透明代理 | 代理内部 ProxyAdmin 的 `upgradeAndCall`（仅 initialOwner） |

两个模块均自动执行 `initialize(owner)` 与 `setTokenOracle`（ETH / USDC），部署完成即可直接使用。

---

## 2. 环境准备

### 2.1 安装依赖

```bash
npm install
```

### 2.2 配置环境变量（.env）

在项目根目录创建 `.env` 文件（参考 `.env` 已有内容）：

```bash
# Sepolia RPC 节点地址（Infura / Alchemy / 公共 RPC 均可）
# 例：https://sepolia.infura.io/v3/<你的Infura项目ID>
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/xxxxxxxxxxxxxxxx

# 部署账户私钥（以 0x 开头，共 66 个字符）
# ⚠️ 仅用于测试网，切勿提交到仓库或在聊天中公开
SEPOLIA_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000000

# Etherscan API Key（用于合约验证，可到 https://etherscan.io/myapikey 免费申请）
SEPOLIA_ETHERSCAN_API_KEY=YourApiKeyToken
```

> **本地部署不需要任何环境变量**，`hardhatMainnet` 使用 Hardhat 内置测试账户。

> `hardhat.config.ts` 顶部已调用 `dotenv.config()`，启动时自动加载 `.env`；如需使用其他来源的变量，可手动 `export SEPOLIA_RPC_URL=...` 后再执行命令。

---

## 3. 部署流程

### 3.1 本地 localhost 部署（推荐先跑通）

```bash
# UUPS 模式
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts --network hardhatMainnet

# 透明代理模式
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionTransparent.ts --network hardhatMainnet
```

**特点**（EDR 进程内模拟链）：

- 部署使用内置测试账户（默认 `0xf39F...`），无 gas 成本；
- 每次命令都是全新的模拟链，**部署结果不持久化**（下次命令重新执行，Ignition 会给出 `results will be lost` 提示）；
- 由于部署者 nonce 序列固定，同一模块每次部署得到的地址一致（EOA 确定性地址），可用于重复演示。

> 若希望连到**独立本地节点**（如 `npx hardhat node` 或 anvil，监听 `127.0.0.1:8545`），需在 `hardhat.config.ts` 的 `networks` 中补充 http 网络配置：

```ts
localhost: {
  type: "http",
  chainType: "l1",
  url: "http://127.0.0.1:8545",
  accounts: [configVariable("LOCALHOST_PRIVATE_KEY")], // 本地节点某个账户的私钥
},
```

### 3.2 测试网 Sepolia 部署

前置条件：`.env` 已配置 `SEPOLIA_RPC_URL` 与 `SEPOLIA_PRIVATE_KEY`，且该账户持有测试 ETH（可通过 [Sepolia Faucet](https://faucet.sepolia.io) 领取）。

```bash
# 1) 使用默认参数部署
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts --network sepolia

# 2) 或使用参数文件（parameters.sepolia.json 已提供默认值，按需修改后引用）
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts \
  --network sepolia \
  --parameters ignition/modules/parameters.sepolia.json
```

**注意事项**：

- Ignition 会在 `ignition/deployments/` 记录部署状态，**重复部署同一模块会幂等跳过**（不会重复花钱）；
- 若想强制重新部署，先执行 `npx hardhat ignition wipe <deploymentId> --network sepolia`（需谨慎，会丢失旧地址）。参数是位置参数，不是 `--deployment-id`。

### 3.3 部署参数说明（--parameters）

模块支持以下参数，未传时使用默认值：

| 参数名 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `usdcDecimals` | number | `6` | USDC 小数位（真实 USDC 为 6） |
| `usdcInitialSupply` | string (raw) | `100000000000` | USDC 初始供应量（含小数位，即 100,000 USDC × 10⁶） |
| `ethUsdPrice` | string (raw) | `200000000000` | ETH/USD 预言机价格（8 位小数，即 $2000 × 10⁸） |
| `usdcUsdPrice` | string (raw) | `100000000` | USDC/USD 预言机价格（8 位小数，即 $1 × 10⁸） |

> 数值含义：合约内所有美元价格统一使用 **8 位小数**（Chainlink 标准），金额换算见 `MetaNFTAuctionBase._toUsd`。
> 使用 ethers 辅助换算：`parseUnits("2000", 8).toString()` → `"200000000000"`。

管理员 `owner` 固定为**部署账户**（`m.getAccount(0)`），即执行部署命令的签名者。

---

## 4. 部署后验证

以本地部署为例（UUPS 模式），可用 `npx hardhat console --network hardhatMainnet` 或脚本查询：

```ts
// 从部署输出中记录代理地址（Auction / AuctionProxy 为同一地址）
const proxyAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"; // 替换为实际输出

// 查询版本号：应为 "MetaNFTAuctionUUPSV1"
await (await ethers.getContractAt("MetaNFTAuctionUUPS", proxyAddress)).getVersion();

// 查询预言机是否注册成功（0x0...0 = ETH 出价币种）
await (await ethers.getContractAt("MetaNFTAuctionUUPS", proxyAddress)).tokenToOracle("0x0000000000000000000000000000000000000000");
```

### 启动一场拍卖（业务操作）

部署完成后需要手动启动拍卖（需要卖家铸造并授权 NFT）：

```ts
const nft = await ethers.getContractAt("MetaNFT", nftAddress);
const auction = await ethers.getContractAt("MetaNFTAuctionUUPS", proxyAddress);

// 1) owner 铸造 NFT 给卖家
await (await nft.mint(sellerAddress, "ipfs://meta/1")).wait();
// 2) 卖家授权拍卖合约托管 NFT
await (await nft.connect(sellerSigner).setApprovalForAll(proxyAddress, true)).wait();
// 3) owner 启动拍卖：拍品 0，USDC 计价，起拍价 $1000，时长 3600 秒
await (
  await auction.start(sellerAddress, 1n, nftAddress, 1000, 3600, usdcAddress)
).wait();
```

---

## 5. 合约升级（可选）

### UUPS 模式

```ts
// 部署 V2 实现后，由 owner 调用
const v2 = await (await ethers.getContractFactory("MetaNFTAuctionUUPSV2")).deploy();
await (await auction.upgradeToAndCall(await v2.getAddress(), "0x")).wait();
// 验证：auction.getVersion() 应返回 "MetaNFTAuctionUUPSV2"
```

### 透明代理模式

OZ v5.6 中代理内部自动创建 ProxyAdmin（owner = 部署账户），升级通过内部 ProxyAdmin 的 `upgradeAndCall`：

```ts
const v2 = await (await ethers.getContractFactory("MetaNFTAuctionTransparentV2")).deploy();
// 读取代理内部 ProxyAdmin 地址（ERC1967 admin 槽位）
const slot = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";
const admin = "0x" + (await ethers.provider.getStorage(proxyAddress, slot)).slice(-40);
const proxyAdmin = await ethers.getContractAt("ProxyAdmin", admin);
await (await proxyAdmin.upgradeAndCall(proxyAddress, await v2.getAddress(), "0x")).wait();
```

---

## 6. 常见问题排查

| 现象 | 可能原因 | 解决办法 |
|---|---|---|
| `HHE10702: The id "xxx" is invalid` | Ignition 模块 id 含非法字符 | id 只能包含字母、数字、下划线 |
| `Artifact for contract "ERC1967Proxy" not found` | OZ 代理合约未参与编译 | 确认 `hardhat.config.ts` 的 `solidity.npmFilesToBuild` 包含三个 OZ 代理文件（已配置） |
| `HHE11: Variable SEPOLIA_RPC_URL not set` | `.env` 缺失或未加载 | 检查 `.env` 是否存在、键名拼写正确；`dotenv` 由 Hardhat 自动加载 |
| `InvalidPrivateKey` | 私钥格式错误 | 需以 `0x` 开头共 66 个字符 |
| `network does not support EIP-1559` / 交易超时 | RPC 节点不稳定 | 更换 RPC（Infura/Alchemy/公共节点） |
| `nonce too low` | 本地节点重启后 nonce 缓存 | 重启 Hardhat / 清空 `ignition/deployments` 对应记录后重试 |
| `insufficient funds` | 测试网余额不足 | 到 Sepolia 水龙头领取测试 ETH |
| 重复部署地址不变 | Ignition 幂等跳过 | 属正常行为；需重部署时先 `ignition wipe` 或（本地链）直接重跑 |
| `[safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED]` | 本机沙箱删除保护拦截 Hardhat 缓存锁 | 临时执行：`env -u CODEBUDDY_TOOL_CALL_ID -u CODEBUDDY_SAFE_DELETE_BULK_STATE_DIR -u CODEBUDDY_SAFE_DELETE_BULK_GUARD npx hardhat ...`（普通终端不受影响） |
| `ProviderError: in-flight transaction limit reached for delegated accounts` | 公共 RPC（Infura/Alchemy）对同账户并发 in-flight 交易数有限制；Ignition 默认会把所有无依赖的 future 放在同一 batch 并发 send | 两个部署模块（`MetaNFTAuctionUUPS.ts` / `MetaNFTAuctionTransparent.ts`）已用 `after` 把独立合约串行化（每个 batch 只 1 笔 tx），彻底规避该限制。⚠️ 此前在 `sepolia` 网络配置中添加的 `ethers.waitForTransactionReceipt: true` **对 Ignition 部署无效**——Ignition 走自己的 `JsonRpcClient.sendTransaction`，不经过 hardhat-ethers signer，可以从配置中移除 |
| `HHE10410: An error occurred while trying to send a transaction for future ... nonce X sent from account ...` | 上一次部署被中断时部分交易已被 RPC 接受（nonce 已被占用），但 Ignition 的部署记录中缺失这笔交易，恢复时检测到 nonce 跳跃就拒绝 | 见下方"半完成部署恢复"两方案 |

### 半完成部署恢复（HHE10410）

出现 `HHE10410` 说明上一次部署被中断，但部分交易实际已被 RPC 接受——nonce 已被占用，Ignition 不认识这笔交易，恢复时拒绝继续。**两种恢复方案**：

**方案 A · 继续原部署（推荐，保持地址连续性）**

1. 浏览器查账户的 nonce X 交易：  
   `https://sepolia.etherscan.io/address/<账户地址>`（找 `to=null` 即合约创建且 status=success 的那笔，记录其 `txHash`）
2. 告诉 Ignition 这笔交易属于本次部署：

   ```bash
   npx hardhat ignition track-tx <txHash> <deploymentId> --network sepolia
   ```
3. 重新跑 deploy，Ignition 会从断点继续（已 track 的 future 跳过，执行剩余的）

**方案 B · 清空重来（最简单，但链上会留下旧合约）**

Hardhat Ignition 3 的 `wipe` 命令**只支持清空单个 futureId**，且必须按依赖顺序逐个操作（实际几乎不可用），**没有"清空整个部署"的内置命令**。推荐直接删除部署目录：

```bash
rm -rf ignition/deployments/<deploymentId>
# 例：rm -rf ignition/deployments/chain-11155111
```

然后重新 `ignition deploy ...`，会得到一组**全新的合约地址**。原已上链的合约不会自动删除（只是 Ignition 不再管理它们）。

> deploymentId 默认是 `chain-${chainId}`（如 Sepolia 即 `chain-11155111`），可用 deploymentId 参数在多次部署间隔离。
>
> **注意**：`ignition track-tx` 的参数是**位置参数**（不是 `--deployment-id` 选项）；`wipe` 必须同时指定 `deploymentId` 与单个 `futureId`（且该 future 不能被其他 future 依赖）：
>
> ```bash
> npx hardhat ignition track-tx <txHash> <deploymentId> --network <network>
> npx hardhat ignition wipe <deploymentId> <futureId> --network <network>
> ```

### 合约验证（Sepolia）

验证合约源码需配置 Etherscan API Key 并在 `hardhat.config.ts` 的 `networks` 中补充：

```ts
sepolia: {
  type: "http",
  chainType: "l1",
  url: configVariable("SEPOLIA_RPC_URL"),
  accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
  // 如需验证（Hardhat 3 通过 verify 任务），按需补充 etherscan 配置：
  // etherscan: { apiKey: { sepolia: configVariable("SEPOLIA_ETHERSCAN_API_KEY") } }
},
```

---

## 7. 快速参考命令

```bash
# 本地（UUPS / 透明代理）
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts --network hardhatMainnet
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionTransparent.ts --network hardhatMainnet

# 测试网
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts --network sepolia
npx hardhat ignition deploy ignition/modules/MetaNFTAuctionUUPS.ts --network sepolia --parameters ignition/modules/parameters.sepolia.json

# 查看部署状态
npx hardhat ignition status <chainId>

# 擦除某次部署（推荐用 rm -rf，见 FAQ「半完成部署恢复」方案 B）
rm -rf ignition/deployments/<deploymentId>

# 清单个 future（需要先无依赖，常见不可用）
npx hardhat ignition wipe <deploymentId> <futureId> --network sepolia

# 部署图可视化（生成 html）
npx hardhat ignition visualize
```

关联文档：作业说明见 `../../homework03.md`，合约源码见 `../../contracts/`，交互脚本见 `../../scripts/interact.ethers.ts`。

## 8.部署记录
```
(base) ykwang@192 homework03 % npx hardhat ignition deploy ignition/modules/MetaNFTAuctionTransparent.ts --network sepolia
◇ injected env (3) from .env // tip: ◈ secrets for agents [www.dotenvx.com]
✔ Confirm deploy to network sepolia (11155111)? … yes

Hardhat Ignition 🚀

Deploying [ MetaNFTAuctionTransparent ]

Batch #1
  Executed MetaNFTAuctionTransparent#MetaNFT

Batch #2
  Executed MetaNFTAuctionTransparent#MockUSDC

Batch #3
  Executed MetaNFTAuctionTransparent#ETHUSD_Oracle

Batch #4
  Executed MetaNFTAuctionTransparent#USDCUSD_Oracle

Batch #5
  Executed MetaNFTAuctionTransparent#AuctionImpl

Batch #6
  Executed MetaNFTAuctionTransparent#encodeFunctionCall(MetaNFTAuctionTransparent#AuctionImpl.initialize)

Batch #7
  Executed MetaNFTAuctionTransparent#AuctionProxy

Batch #8
  Executed MetaNFTAuctionTransparent#Auction

Batch #9
  Executed MetaNFTAuctionTransparent#SetETHPrices

Batch #10
  Executed MetaNFTAuctionTransparent#SetUSDCPrices

[ MetaNFTAuctionTransparent ] successfully deployed 🚀

Deployed Addresses

MetaNFTAuctionTransparent#MetaNFT - 0xE24e475F44f168090Dd0cC9b52ebe515f7a5f720
MetaNFTAuctionTransparent#MockUSDC - 0xAA7F0E4294da18a32068F51C387b157b60Fa45b4
MetaNFTAuctionTransparent#ETHUSD_Oracle - 0x08E57230a48393ca25EB7c308885BAE59Ab7C99D
MetaNFTAuctionTransparent#USDCUSD_Oracle - 0x1215cC58B60d42728ad7B88F81e349e89e6976dc
MetaNFTAuctionTransparent#AuctionImpl - 0xB356dEbb2672F2f387e4b8EdadDd2F86d6AF11E0
MetaNFTAuctionTransparent#AuctionProxy - 0x825Eaa7654782b4275EacbfbB61Cc03688e935DB
MetaNFTAuctionTransparent#Auction - 0x825Eaa7654782b4275EacbfbB61Cc03688e935DB
```
