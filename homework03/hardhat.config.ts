import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import dotenv from "dotenv";

// 让 configVariable 能从 .env 读取 SEPOLIA_RPC_URL / SEPOLIA_PRIVATE_KEY / SEPOLIA_ETHERSCAN_API_KEY
// Hardhat 3 不会自动加载 .env，需手动 dotenv.config()
dotenv.config();

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    // 编译 npm 依赖中的 OZ 代理合约，生成 artifact 供测试部署代理使用
    npmFilesToBuild: [
      "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol",
      "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
      "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
    ],
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
      // 等待交易确认后再返回，避免公共 RPC 对同账户并发 in-flight 交易的限制
      // （Ignition 部署时会并行广播多个 deploy 交易，不等待会被 Alchemy/Infura 拒绝）
      ethers: { waitForTransactionReceipt: true },
    },
  },
});
