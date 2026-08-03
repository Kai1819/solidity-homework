/**
 * 合约 ABI（human-readable 格式，ethers v6 支持）
 * 拍卖合约用 MetaNFTAuctionTransparent 系列 ABI（V1/V2 接口一致，
 * newFeature 为 V2 新增；前端不调用，仅为类型兼容保留）。
 */

export const MetaNFTAuctionV2ABI = [
  // ---------- 查询 ----------
  "function auctionId() view returns (uint256)",
  "function auctions(uint256) view returns (address nft, uint256 nftId, address seller, address highestBidder, uint256 startingTime, uint256 duration, address paymentToken, uint256 startingPriceInDollar, uint256 highestBid, uint256 highestBidInDollar, address highestBidToken)",
  "function isEnded(uint256) view returns (bool)",
  "function getVersion() view returns (string)",
  "function getPriceInDollar(address token) view returns (uint256)",
  "function tokenToOracle(address) view returns (address)",
  "function newFeature() pure returns (string)",
  // ---------- 写操作 ----------
  "function start(address seller, uint256 nftId, address nft, uint256 startingPriceInDollar, uint256 duration, address paymentToken)",
  "function bid(uint256, uint256) payable",
  "function end(uint256)",
  "function setTokenOracle(address token, address oracle)",
  // ---------- 事件 ----------
  "event StartBid(uint256 startingBid)",
  "event Bid(address indexed sender, uint256 amount)",
  "event EndBid(uint256 indexed auctionId)",
] as const;

// homework03 的 MetaNFT（Ownable + ERC721Burnable）：
//   - mint(address to, string tokenURI_) onlyOwner：由 owner 铸造，tokenId 合约内自增，返回新 id
//   - 无 mintNext / 无指定 id 铸造（与 hardhatV3Nft 的公开 mint(address,uint256) 不同）
export const MetaNFTABI = [
  "constructor()",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function owner() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function ownerOf(uint256) view returns (address)",
  "function tokenURI(uint256) view returns (string)",
  "function getApproved(uint256) view returns (address)",
  "function isApprovedForAll(address, address) view returns (bool)",
  "function mint(address to, string tokenURI_) returns (uint256)",
  "function burn(uint256 id)",
  "function approve(address to, uint256 tokenId)",
  "function setApprovalForAll(address operator, bool approved)",
  "function transferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
] as const;

// homework03 的 MockERC20（Ownable 继承但 mint 公开）：mint 无 onlyOwner，
// 任何账户都可调用（合约层开放），与 hardhatV3Nft 一致；FaucetModal 对所有账户开放。
export const MockERC20ABI = [
  "constructor(string name, string symbol, uint8 decimals_, uint256 initialSupply)",
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function owner() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
  "function mint(address to, uint256 amount)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
] as const;

export const MockOracleABI = [
  "constructor(int256 initialPrice)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function setPrice(int256 newPrice)",
  "function getPrice() view returns (int256)",
] as const;

export const ProxyAdminABI = [
  "function owner() view returns (address)",
  "function getProxyImplementation(address) view returns (address)",
] as const;
