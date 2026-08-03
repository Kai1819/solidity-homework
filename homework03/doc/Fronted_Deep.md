# MetaNFT Auction 前端深度解读（Fronted_Deep.md）

> 面向新手小白的前端项目精读文档。以 `homework03/frontend` 为蓝本，逐层拆解：目录结构、架构设计、技术选型、部署、测试与上线全流程。
> 本前端是一个 **Web3 NFT 拍卖平台**：连接 MetaMask 钱包，浏览/发起/参与 NFT 拍卖，支持 ETH 与 USDC 双币种出价。
> ⚠️ 本文档已按 homework03 实际合约接口校对：拍卖合约名为 `MetaNFTAuctionTransparent`（基类 `MetaNFTAuctionBase`）、权限修饰符为 `onlyOwner`（owner）、MetaNFT 铸造接口为 `mint(to, tokenURI_)`（无 mintNext）。与源项目 hardhatV3Nft 的差异以本文档为准。

---

## 目录

- [第 1 章 项目总览](#第-1-章-项目总览)
- [第 2 章 目录结构解析](#第-2-章-目录结构解析)
- [第 3 章 项目设计与架构](#第-3-章-项目设计与架构)
- [第 4 章 使用技术与依赖](#第-4-章-使用技术与依赖)
- [第 5 章 部署流程](#第-5-章-部署流程)
- [第 6 章 测试流程](#第-6-章-测试流程)
- [第 7 章 上线流程（CI/CD 与发布）](#第-7-章-上线流程cicd-与发布)
- [第 8 章 常见问题与最佳实践](#第-8-章-常见问题与最佳实践)

---

## 第 1 章 项目总览

### 1.1 这个前端是干什么的？

一个 **Next.js 单页应用（SPA 风格的多页面应用）**，用户可以通过浏览器钱包（MetaMask）在 Sepolia 测试网上完成：

| 页面 | 能做什么 |
|---|---|
| 首页 `/` | 浏览拍卖卡片、按状态筛选、铸造 NFT、领取 USDC 测试币 |
| 详情页 `/auction/[id]` | 查看拍卖详情、ETH/USDC 双模式出价、结束拍卖 |
| 管理页 `/admin` | 管理员启动拍卖、设置价格预言机（Oracle） |
| 资产页 `/assets` | 查看持有的 NFT、参与的拍卖、拍得的拍卖 |
| 初始化页 `/setup` | 一键部署辅助合约（MetaNFT/USDC/Oracle）并配置价格源 |

### 1.2 与后端（链上合约）的关系

这个项目**没有传统意义上的后端服务器** —— 数据存在区块链上，前端通过 ethers.js 直接与智能合约交互：

```
┌──────────────┐   RPC 调用    ┌──────────────────┐
│  浏览器前端    │ ───────────► │  MetaMask 钱包    │
│  Next.js 页面  │ ◄─────────── │  (Signer/Provider)│
└──────────────┘               └────────┬─────────┘
                                        │ JSON-RPC
                                        ▼
                              ┌──────────────────┐
                              │ 链上合约 (Sepolia) │
                              │  MetaNFTAuction   │
                              │  Transparent      │
                              │  MetaNFT / USDC   │
                              └──────────────────┘
```

前端角色的三个关键概念（新手必懂）：

- **Provider（只读）**：连接 RPC 节点，用于「查询」——读拍卖列表、查余额。
- **Signer（签名）**：连接钱包私钥，用于「写操作」——出价、铸造、授权，需要用户确认交易。
- **ChainId（链 ID）**：确保连接在正确的链（本项目 Sepolia = 11155111）。

---

## 第 2 章 目录结构解析

### 2.1 顶层结构

```
frontend/
├── app/                  # ★ Next.js App Router 路由与页面
├── components/           # ★ React 组件（UI 与业务组件）
├── hooks/                # ★ 自定义 React Hooks（链上逻辑复用）
├── lib/                  # ★ 工具库（ABI / 配置 / 格式化 / 部署）
├── types/                # TypeScript 类型定义
├── node_modules/         # npm 依赖（不提交 git）
├── next-env.d.ts         # Next.js 自动生成的环境类型声明
├── next.config.js        # Next.js 配置文件
├── package.json          # 依赖清单与脚本
├── postcss.config.js     # PostCSS 配置（Tailwind 核心）
├── tailwind.config.js    # Tailwind CSS 配置
├── tsconfig.json         # TypeScript 配置
└── README.md             # 项目说明
```

### 2.2 关键文件逐个讲

| 文件 | 作用 | 重要程度 |
|---|---|---|
| `package.json` | 声明依赖与 npm 脚本（dev/build/start/lint） | ★★★ |
| `next.config.js` | Next.js 配置；关键：`webpack.resolve.fallback` 屏蔽 ethers 用不到的 Node 内置模块（fs/net/tls），否则浏览器打包报错 | ★★★ |
| `tsconfig.json` | TypeScript 编译配置；`paths` 里 `@/*` 指向根目录（`@/components` = `frontend/components`） | ★★★ |
| `tailwind.config.js` | 定制主题色（primary 蓝系）、动画 keyframes（fade-in/scale-in/slide-up） | ★★ |
| `postcss.config.js` | 把 Tailwind 接入 PostCSS 构建链 | ★★ |
| `next-env.d.ts` | Next.js 自动维护，不要手改 | ★ |

### 2.3 `app/` 路由目录（App Router 约定式路由）

```
app/
├── layout.tsx          # 根布局：全局 Provider 包裹 + 顶栏 Header
├── page.tsx            # 首页（/）
├── globals.css         # 全局样式（Tailwind 指令 + 滚动条美化）
├── admin/page.tsx      # 管理页（/admin）
├── assets/page.tsx     # 资产页（/assets）
├── setup/page.tsx      # 初始化页（/setup）
└── auction/[id]/page.tsx  # 拍卖详情（动态路由 /auction/123）
```

> 💡 **约定式路由**：Next.js App Router 里「文件夹 = 路由」。`auction/[id]` 的方括号表示动态参数，`/auction/5` 时 `id=5`。

### 2.4 `components/` 组件目录

按职责分三类：

| 类别 | 组件 | 说明 |
|---|---|---|
| **基础设施** | `Web3Provider`、`AlertProvider` | 全局 Context：钱包状态 / 消息提示 |
| **通用 UI** | `Modal`、`AlertDialog`、`CountdownTimer`、`NftPlaceholder`、`AuctionStatusBadge`、`ConnectButton`、`Header`、`AccountDetailsModal` | 可复用的展示与交互件 |
| **业务组件** | `AuctionCard`、`AdminPanel`、`BidModal`、`MintPanel`、`FaucetModal`、`StartAuctionModal`、`SetOracleModal`、`SetupWizard`、`EndAuctionButton` | 各业务流程的弹窗/面板 |

### 2.5 `hooks/` 自定义 Hook（核心业务逻辑）

| Hook | 职责 |
|---|---|
| `useWeb3.ts` | 重导出钱包 Context（连接/断开/账户） |
| `useAuctionContract.ts` | 拍卖合约工厂：只读实例 / 签名实例 |
| `useAuxContracts.ts` | 辅助合约（MetaNFT/USDC/Oracle）工厂，地址 env/localStorage 合并 |
| `useAuctions.ts` | 拍卖列表：`auctionId()` 计数 + 批量 `auctions(i)` 查询 |
| `useAuction.ts` | 单拍卖详情 + ETH/USDC 实时价格 |
| `useMetaNFT.ts` | NFT 铸造 / 授权 / 持仓 + **useUSDC**（余额/授权/领取测试币） |
| `useBalances.ts` | 账户 ETH / USDC 余额 |
| `useAdmin.ts` | 管理员判定（ProxyAdmin.owner() 动态查）+ start/setTokenOracle（合约侧权限为 onlyOwner） |
| `useTx.ts` | 统一交易封装（try/catch + 错误映射 + 成功提示） |
| `useSetup.ts` | 初始化向导状态机（部署/配置 oracle/保存） |
| `useLocalAuxAddresses.ts` | 客户端安全读取 localStorage 地址（避免 hydration 错误） |

### 2.6 `lib/` 工具库

| 文件 | 职责 |
|---|---|
| `abis.ts` | 合约 ABI 字符串数组（Transparent/ERC721/ERC20/Oracle/ProxyAdmin）；auctions() tuple 字段顺序与 Solidity struct 严格一致 |
| `bytecodes.ts` | 从 Hardhat artifacts 提取的 creation bytecode（供浏览器端一键部署） |
| `config.ts` | 地址解析：**env 优先 > localStorage 兜底**；SSR 安全的 env 读取 |
| `constants.ts` | 链 ID、ZERO_ADDRESS、小数位、**Chainlink Sepolia 喂价地址** |
| `format.ts` | 美元格式化（8 位小数）、拍卖状态机、错误→中文提示 |
| `deploy.ts` | 浏览器端用 `ContractFactory` 部署 MetaNFT/USDC/Oracle |
| `chunkedGetLogs.ts` | 分块扫描 `eth_getLogs`，突破 RPC 单次 10000 块上限 |

### 2.7 `types/`

- `index.ts`：`Auction`（11 字段结构体）、`AuctionView`（派生展示字段）、`SetupAddresses`、`SetupState` 等。
- `window.d.ts`：给 `window.ethereum` 补类型（MetaMask 注入）。

---

## 第 3 章 项目设计与架构

### 3.1 整体架构：Next.js App Router + 客户端渲染（CSR）

```
[浏览器] 加载页面
    │
    ▼
[app/layout.tsx]  ← 根布局
    │  Web3Provider（钱包状态）
    │  AlertProvider（消息提示）
    ▼
[页面组件] page.tsx / admin / assets / auction/[id]
    │  调用
    ▼
[hooks] useAuctions / useAuction / useAdmin ...
    │  内部
    ▼
[lib] config / abis / format / chunkedGetLogs
    │
    ▼
[ethers v6] Provider / Signer ──► MetaMask ──► 链上合约
```

**关键架构决策：**

1. **全部页面 `"use client"`**：Web3 交互依赖浏览器 API（window.ethereum），无法服务端渲染 → 全站客户端渲染。
2. **Hook 层抽象链上逻辑**：组件不直接写 ethers 调用，全部收进 hooks，组件只关心「数据 + 回调」。
3. **lib 层纯工具**：无 React 依赖的纯函数（格式、ABI、配置），可单独测试。

### 3.2 状态管理方案：React Context + 自定义 Hook

**没有用 Redux/Zustand**，原因：状态简单且是「低频变更 + 异步查询」模式，Context 足够。

| 状态 | 管理方式 | 存放 |
|---|---|---|
| 钱包连接（account/signer） | `useState` + `Context` | `Web3Provider` |
| 全局消息（success/error） | `useState` + `Context` | `AlertProvider` |
| 拍卖列表 / 详情 | Hook 内 `useState`，页面自行调用 | `useAuctions` / `useAuction` |
| 合约地址配置 | 读取 env + localStorage（只读） | `lib/config.ts` |

**Web3Provider 内部逻辑（钱包状态机）：**

```
useEffect(初始化)
  ├─ window.ethereum 存在？→ 创建 BrowserProvider
  ├─ 网络正确？→ 自动 switchToTargetChain（切换/添加 Sepolia）
  └─ 监听 accountsChanged / chainChanged → 刷新 signer
connectWallet() → eth_requestAccounts → 设 account/signer
disconnect() → 清空
```

### 3.3 路由设计

| 路由 | 类型 | 权限 | 说明 |
|---|---|---|---|
| `/` | 公开 | 无 | 首页市场 |
| `/auction/[id]` | 公开（动态） | 无 | 详情 + 出价 |
| `/admin` | 客户端守卫 | **管理员** | 非管理员显示「仅管理员可访问」 |
| `/assets` | 公开 | 需连接钱包 | 未连接显示「请先连接钱包」 |
| `/setup` | 客户端守卫 | **管理员** | 初始化向导 |

> 💡 **权限守卫在客户端做**（`isAdmin` 判断），真正的安全由合约 `onlyOwner` 保证——前端守卫只是 UX 优化。

### 3.4 组件划分原则

1. **一个组件一个职责**：`BidModal` 只管出价，`CountdownTimer` 只管倒计时。
2. **容器 vs 展示分离**：页面负责取数据（hooks），子组件负责展示（props 传入）。
3. **弹窗统一化**：`Modal` 提供基础遮罩/关闭，业务弹窗基于它扩展。
4. **SSR 安全**：凡读 localStorage/window 的组件，用 `useEffect` 延迟到 mount 后再读（`useLocalAuxAddresses`），避免 hydration 报错。

### 3.5 目录划分的设计思想

```
app/         页面（路由容器）      ← 谁在看？
components/  可复用 UI/业务组件    ← 怎么呈现？
hooks/       链上/业务逻辑        ← 数据从哪来？
lib/         纯工具/配置/ABI     ← 底层能力？
types/       类型契约            ← 数据长什么样？
```

**分层依赖方向（单向）**：`app → components/hooks → lib → ethers`。上层依赖下层，下层不依赖上层，保证可测试性与可替换性。

---

## 第 4 章 使用技术与依赖

### 4.1 核心技术栈

| 技术 | 版本 | 扮演的角色 | 为什么选它 |
|---|---|---|---|
| **Next.js 14** | ^14.0.4 | React 框架（App Router） | 约定式路由 + 目录即路由，生态成熟 |
| **React 18** | ^18.2.0 | UI 库 | 组件化 + Hooks |
| **ethers v6** | ^6.9.0 | 区块链交互 | Web3 事实标准库，BrowserProvider/Contract 好用 |
| **Tailwind CSS** | ^3.4.1 | 样式 | 原子化 CSS，快速出界面 |
| **TypeScript** | ^5.3.3 | 类型系统 | 编译期防错 |
| **lucide-react** | ^0.303.0 | 图标 | 轻量、tree-shaking |
| **date-fns** | ^3.0.6 | 日期格式化 | 倒计时/时间显示 |

### 4.2 关键依赖说明（小白重点）

**ethers v6 三件套**（前端与链交互的核心）：

```ts
// 1. BrowserProvider：包装 window.ethereum，提供只读查询
const provider = new ethers.BrowserProvider(window.ethereum);

// 2. getSigner：获取签名者（写操作需要）
const signer = await provider.getSigner();

// 3. Contract：合约实例（ABI + 地址 + provider/signer）
const contract = new ethers.Contract(addr, ABI, signer);
const tx = await contract.bid(id, amount, { value: amountRaw });
await tx.wait();  // 等待交易上链
```

**为何 next.config.js 要 fallback fs/net/tls？**

ethers 是「同构库」（Node + 浏览器都能跑），打包时 webpack 想给它注入 Node 内置模块，浏览器没有 → 报错。配置 `fallback: { fs: false, net: false, tls: false }` 告诉 webpack「这些模块用不到，别注入」：

```js
// next.config.js
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};
```

### 4.3 前端如何「零后端」拿数据？

关键在 `lib/config.ts` 的**地址解析策略**：

```
getMetaNFTAddress() = env(NEXT_PUBLIC_META_NFT_ADDRESS) || localStorage(auction.config) || ""
```

- **env 优先**：部署时写死地址（生产推荐）。
- **localStorage 兜底**：用户在 `/setup` 页面浏览器一键部署辅助合约后，地址自动写入 `localStorage`，无需重启服务。
- **SSR 安全**：env 函数只读 env（服务端/客户端一致）；localStorage 读取必须放 `useEffect`（防 hydration 不匹配）。

---

## 第 5 章 部署流程

### 5.1 本地开发

```bash
cd frontend

# 1. 安装依赖
npm install

# 2. 配置环境变量（复制模板并填写）
cp .env.local.example .env.local   # 若存在
# 编辑 .env.local：填写合约地址、链 ID、RPC

# 3. 启动开发服务器（热更新）
npm run dev
# 打开 http://localhost:3000
```

**开发模式特点**：代码改动即时生效（HMR）；生产构建优化关闭。

### 5.2 生产构建

```bash
npm run build
```

**构建产物**：输出到 `.next/` 目录。构建过程会：

1. 类型检查（TypeScript）；
2. 编译 React/JSX；
3. Tailwind 生成最终 CSS；
4. 静态页面预渲染 + 客户端 JS 打包；
5. 输出路由清单（如 7 个路由，First Load JS ~200KB）。

**常见构建错误与解决：**

| 报错 | 原因 | 解决 |
|---|---|---|
| `Module not found: Can't resolve 'fs'` | ethers 需要 node polyfill | next.config.js 加 fallback（项目已配） |
| `Type error: Property 'ethereum' does not exist on type 'Window'` | window.ethereum 无类型 | 引入 `types/window.d.ts`（已配） |
| `Failed to compile` | 语法/类型错误 | 看具体错误行修复 |

### 5.3 生产服务器部署（方案一：Node 服务器）

```bash
# 1. 构建
npm run build

# 2. 启动生产服务器（默认 3000 端口）
npm run start

# 3. 用 PM2 守护进程（长期运行）
pm2 start npm --name metanft-frontend -- start
pm2 save
```

### 5.4 生产部署（方案二：Vercel / 静态托管）

Next.js 官方推荐 **Vercel**（零配置）：

```
1. 代码推到 GitHub
2. Vercel 导入仓库
3. 环境变量在 Vercel 控制台配置（NEXT_PUBLIC_*）
4. 自动构建 + 部署，得到 https://xxx.vercel.app
```

> ⚠️ **静态导出注意**：本项目依赖运行时查询链上数据，**不能**用 `next export` 纯静态导出（动态路由需要服务端或 ISR）。若必须静态托管，需改用 `output: 'export'` 并处理动态路由，或接受每次请求走客户端 JS。

### 5.5 环境变量清单（部署必配）

| 变量 | 含义 | 示例 |
|---|---|---|
| `NEXT_PUBLIC_AUCTION_ADDRESS` | 拍卖合约地址（透明代理） | `0x825Eaa...935DB` |
| `NEXT_PUBLIC_PROXY_ADMIN_ADDRESS` | ProxyAdmin 地址（EIP-1967 admin 槽） | `0xa73d...b9a` |
| `NEXT_PUBLIC_ADMIN_ADDRESS` | 管理员地址（env 兜底） | `0x4E28...FE75` |
| `NEXT_PUBLIC_CHAIN_ID` | 目标链 ID | `11155111` |
| `NEXT_PUBLIC_RPC_URL` | 只读 RPC（钱包回退用） | `https://sepolia.infura.io/v3/...` |
| `NEXT_PUBLIC_ETHERSCAN_API_URL` | 浏览器外链 | `https://sepolia.etherscan.io` |
| `NEXT_PUBLIC_META_NFT_ADDRESS` | 辅助合约地址（可留空走 localStorage） | `0xE24e...f720` |

> 🔑 **重要**：`NEXT_PUBLIC_` 前缀的变量会**暴露到浏览器**，只放公开信息（合约地址、链 ID），**绝不放私钥**。

### 5.6 静态资源处理

- 图片/静态文件放 `public/` 目录（本项目无本地图片，NFT 用 CSS 渐变占位图 `NftPlaceholder`）；
- 组件内引用的静态资源用 `import`（webpack 处理指纹）；
- 外部资源（Etherscan 外链）直接拼 URL。

---

## 第 6 章 测试流程

### 6.1 现状：项目无前端测试（重点说明）

当前 `frontend/package.json` 的 scripts 只有：

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

**没有**：单元测试（Jest/Vitest）、组件测试（Testing Library）、E2E（Playwright/Cypress）。

> 链上业务逻辑的正确性由**后端合约测试**保证（`homework03/test/`）；前端作为「壳」，主要风险点在 ethers 调用参数，目前靠类型检查 + 手动验收。

### 6.2 推荐的测试方案（若补全）

**① 单元测试（Vitest + @testing-library/react）—— 测纯逻辑与格式化**

重点测 `lib/format.ts`（美元格式化、状态机）、`lib/chunkedGetLogs.ts`（分块逻辑）：

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

```ts
// __tests__/format.test.ts
import { describe, it, expect } from "vitest";
import { formatUsd } from "@/lib/format";

describe("formatUsd", () => {
  it("格式化 8 位小数美元", () => {
    expect(formatUsd(100000000000n)).toBe("$1,000.00");
    expect(formatUsd(186905000000n)).toBe("$1,869.05");
  });
});
```

**② 组件测试（Testing Library）—— 测交互**

```tsx
// 例：BidModal 输入校验
it("ETH 模式余额不足时提示", () => {
  render(<BidModal auction={mock} prices={...} open onClose={...} />);
  fireEvent.change(screen.getByPlaceholderText("0.1"), { target: { value: "999" } });
  expect(screen.getByText(/ETH 余额不足/)).toBeInTheDocument();
});
```

> 💡 Web3 组件测试需要 **mock 钱包**：把 `useWeb3` mock 成假 provider/signer，或引入 `viem/wagmi` 的测试工具。

**③ E2E（Playwright）—— 测完整用户路径**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

```ts
// e2e/home.spec.ts
test("首页展示拍卖市场", async ({ page }) => {
  await page.goto("http://localhost:3000");
  await expect(page.getByText("MetaNFT")).toBeVisible();
});
```

> ⚠️ E2E 走真实链上数据不稳定（Sepolia 网络抖动），建议本地起 Hardhat node + 前端连本地 RPC 跑 E2E。

### 6.3 测试文件组织建议

```
frontend/
├── __tests__/                # 单元/组件测试（Vitest）
│   ├── lib/format.test.ts
│   ├── lib/chunkedGetLogs.test.ts
│   └── components/BidModal.test.tsx
├── e2e/                      # E2E（Playwright）
│   ├── home.spec.ts
│   └── auction.spec.ts
├── vitest.config.ts
├── playwright.config.ts
└── package.json  # 加 "test": "vitest run", "test:e2e": "playwright test"
```

### 6.4 运行方式

```bash
# 单元/组件测试
npx vitest run

# 覆盖率
npx vitest run --coverage

# E2E（先启动 dev server）
npm run dev &
npx playwright test
```

### 6.5 现有可用的质量检查

```bash
npm run lint      # ESLint 静态检查
npm run build     # TypeScript 类型检查（构建时自动执行）
npx tsc --noEmit  # 单独跑类型检查（项目里经常用）
```

---

## 第 7 章 上线流程（CI/CD 与发布）

### 7.1 理想的上线流水线（GitHub Actions 示例）

```
[开发] git push 到 main
    │
    ▼
[CI: GitHub Actions] 触发 workflow
    │  1. checkout 代码
    │  2. 安装依赖 (npm ci)
    │  3. Lint (npm run lint)
    │  4. 单元测试 (npm test)
    │  5. 构建 (npm run build)
    │  6. 产物上传 (artifacts)
    ▼
[CD: 自动部署] 成功则部署到服务器/Vercel
```

`.github/workflows/deploy.yml` 示例：

```yaml
name: Deploy Frontend
on:
  push:
    branches: [main]
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      # 部署到服务器（SSH）
      - uses: easingthemes/ssh-deploy@v5
        with:
          SSH_PRIVATE_KEY: ${{ secrets.SSH_PRIVATE_KEY }}
          REMOTE_HOST: ${{ secrets.SERVER_HOST }}
          REMOTE_USER: ubuntu
          SOURCE: ".next/"
          TARGET: "/var/www/metanft/.next/"
      # 或部署到 Vercel
      - run: npx vercel --prod --token ${{ secrets.VERCEL_TOKEN }}
```

### 7.2 环境配置管理

| 环境 | 配置来源 | 说明 |
|---|---|---|
| 本地开发 | `.env.local` | 开发者自填 |
| 测试/预发 | CI 环境变量 | secrets 中配置 |
| 生产 | 服务器 env / Vercel Env | `NEXT_PUBLIC_*` 全部公开变量 |

> 🔒 机密（SSH key、部署 token）放 **GitHub Secrets**，绝不放代码仓库。

### 7.3 发布策略

| 策略 | 适用 | 做法 |
|---|---|---|
| **直接发布** | 小团队/测试网 | main 分支 push → 自动构建部署 |
| **预览部署** | 多人协作 | PR 时 Vercel 生成预览 URL，合并后再上生产 |
| **灰度/回滚** | 生产 | 保留上一版 `.next`，出问题快速切回 |

### 7.4 回滚要点

1. **保留构建产物**：每次部署备份上一版 `.next/` 或打 tag。
2. **Vercel 一键回滚**：控制台 Rollback 到上一个 Deployment。
3. **服务器版**：`pm2` 重启 + 恢复旧目录：

```bash
# 回滚脚本示例
cd /var/www/metanft
cp -r .next .next.bak          # 备份
# 部署新版本失败时：
rm -rf .next && mv .next.bak .next
pm2 restart metanft-frontend
```

### 7.5 监控要点

| 维度 | 工具 | 关注指标 |
|---|---|---|
| 可用性 | UptimeRobot / Vercel 内置 | 404 / 500 率 |
| 性能 | Vercel Analytics / Web Vitals | LCP、CLS、INP |
| 错误 | Sentry（可接入） | 前端 JS 异常、RPC 调用失败 |
| 合约交互 | Etherscan | 交易失败率（用户出价失败可能是合约问题） |

**关键监控场景（Web3 特有）**：
- RPC 请求失败率（网络抖动影响体验）；
- 用户交易 `wait()` 超时/被拒（MetaMask 弹窗未确认）；
- 链上状态与前端缓存不一致（需要刷新）。

---

## 第 8 章 常见问题与最佳实践

### 8.1 本项目已踩过的坑（前端视角）

| 问题 | 根因 | 解决 |
|---|---|---|
| `/assets` 报 `range exceeds limit of 10000` | `eth_getLogs` 单次查全链超 RPC 上限 | 新增 `lib/chunkedGetLogs.ts` 分块扫描 |
| Hydration 失败 | 同步读 localStorage 导致 SSR/CSR 不一致 | env-only 函数 + `useEffect` 延迟读 storage |
| ethers `Result` 展开丢字段 | `{...result}` 只展开索引键 | `toAuctionView` 显式 named 重建 |
| 拍卖字段错位（起拍价 0 / duration 超大） | human-readable ABI tuple 顺序与 Solidity struct 不一致 | `lib/abis.ts` 严格按 struct 声明顺序书写 |
| 详情页 `a.nftId undefined` | ethers v6 Result 不能 spread | `format.ts` 显式字段拷贝 |

### 8.2 前端最佳实践清单

- [ ] `NEXT_PUBLIC_` 只放公开信息，私钥永远放服务端；
- [ ] Web3 写操作统一走 `useTx.run()`（错误映射 + 成功提示 + loading）；
- [ ] 所有读 localStorage/window 的代码放 `useEffect`；
- [ ] 大数字用 `bigint` + `formatUnits`，不要用 `Number()` 处理 ETH 金额（精度丢失）；
- [ ] 页面先做 `loading`（骨架屏）再渲染数据，避免 undefined 崩溃；
- [ ] 动态路由参数先正则校验再 `BigInt()`（防非法 id 崩溃页面）；
- [ ] 提交前跑 `npx tsc --noEmit` + `npm run build`。

### 8.3 进阶方向

- 引入 `wagmi` + `viem`（官方推荐的 Web3 React 库，内置缓存/多链切换）；
- 用 `The Graph` 子图替代 `chunkedGetLogs`（更高效的事件索引）；
- 增加 `Sentry` 前端错误监控；
- 补全自动化测试（Vitest + Playwright）。

---

*本文档基于 `homework03/frontend` 实际代码（2026-08-03 快照，已按链上合约接口校对）编写，面向新手循序渐进。*
