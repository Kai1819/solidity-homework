# MetaNFT Auction 前端（homework03 版）

基于 **Next.js 14 + ethers v6 + Tailwind CSS** 的 NFT 拍卖平台前端（Sepolia 测试网）。
本前端由 hardhatV3Nft/frontend 移植而来，针对 homework03 合约接口做了适配。

## 快速开始

```bash
npm install
npm run dev        # http://localhost:3000
```

## 环境变量

`.env.local` 已配置 homework03 部署在 Sepolia 的合约地址：

```env
NEXT_PUBLIC_AUCTION_ADDRESS=0xc551E7718663Bf2fF0Df4bFcdDb7d8975117a070   # 拍卖合约（透明代理）
NEXT_PUBLIC_PROXY_ADMIN_ADDRESS=0x9dcb24bfd924c74eac41d5ad15c08c9601634bc2
NEXT_PUBLIC_ADMIN_ADDRESS=0x4E284945f747922ccFf68622deE247c2E834fE75
NEXT_PUBLIC_CHAIN_ID=11155111
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/<key>
NEXT_PUBLIC_ETHERSCAN_API_URL=https://sepolia.etherscan.io
NEXT_PUBLIC_META_NFT_ADDRESS=0x9601555dCecBf8641132c5440d73885FC29c8d40
NEXT_PUBLIC_USDC_ADDRESS=0x8Aa1dBB14449556Fe7F85F4996B1A2c1bFD30c3B
NEXT_PUBLIC_ORACLE_ADDRESS=0x9cc7C53395A816748aAf211e75c8F7066746Ec81   # ETH/USD
```

## 页面

| 路由 | 功能 |
|---|---|
| `/` | 拍卖市场：卡片网格、状态过滤、铸造/领取入口 |
| `/auction/[id]` | 拍卖详情：ETH/USDC 双模式出价、结束拍卖、价格行情 |
| `/admin` | 管理员面板：启动拍卖（卖家授权引导）、设置 Oracle、拍卖管理 |
| `/assets` | 我的资产：持有的 NFT、参与/卖出/拍得记录 |
| `/setup` | 初始化向导：一键部署 MetaNFT/USDC/Oracle 并配置价格源 |

## 首次使用流程

1. 连接**管理员钱包**（0x4E28…FE75，需 Sepolia ETH）
2. 辅助合约已由 ignition 部署（见 `.env.local`），可直接用；若换新链可走 `/setup`
3. `/admin` 启动拍卖（先让卖家 `setApprovalForAll` 授权拍卖合约）
4. 回到首页参与竞拍（ETH 或 USDC 双模式）

## homework03 合约差异（前端已适配）

| 项目 | hardhatV3Nft | homework03 | 前端适配 |
|---|---|---|---|
| MetaNFT.mint | 公开 `mint(to, id)` + `mintNext(to)` | onlyOwner `mint(to, tokenURI)`，tokenId 自增 | `useMetaNFT.mintTokenURI`；MintPanel 仅 owner 可铸，从 Transfer 日志解析 tokenId |
| MetaNFT 元数据 | 无 tokenURI | 有 tokenURI（可传空串） | 铸造面板支持填写 tokenURI；未提供用占位图 |
| NFT symbol | MFT | MNFT | 占位图/列表文案改为 MNFT |
| MockERC20.mint | 公开（人人可领） | onlyOwner | FaucetModal 非 owner 禁用并提示 |
| 拍卖合约 | MetaNFTAuctionV2 | MetaNFTAuctionTransparent (V1/V2) | ABI 兼容；详情页动态显示 `getVersion()` |
| 辅助合约 bytecode | hardhatV3Nft 编译产物 | homework03 编译产物 | `lib/bytecodes.ts` 已重新生成 |

## 合约要点（前端已适配的坑）

- 拍卖合约入口为**透明代理**，当前实现由 `getVersion()` 动态返回（V1/V2）
- 美元价格一律 **8 位小数**（`×1e8`）；起拍价传**整数美元**
- ETH 出价要求 `amount == msg.value`；USDC 出价需先 `approve`
- 无人出价的拍卖到期后**无法 end()**（合约缺陷），NFT 锁定在合约中
- 最高出价展示一律以 `auctions()` 查询为准（Bid 事件对 ERC20 出价 amount 恒为 0）
