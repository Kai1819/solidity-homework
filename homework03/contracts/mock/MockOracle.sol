// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @notice 模拟 ChainLink DataFeed AggregatorV3Interface接口 预言机
 * 
 * 测试/演示时：把 MockOracle 地址填进 setTokenOracle(token, mockOracleAddr) → 合约读到写死的价格。
 * 生产/真实时：把 Chainlink 官方 Aggregator Proxy 地址 填进同一个函数 → 合约读到去中心化预言机网络写入的真实价格。合约代码一行都不用改！
 */
contract MockOracle {
    // 内部存储一个固定的价格
    int256 private price;

    /**
     * @notice 构造器
     * @param initialPrice_ 初始价格（如 2000 * 10^8 = $2000）
     */
    constructor(int256 initialPrice_) {
        price = initialPrice_;
    }

    /**
     * @notice 最新聚合价格（最新轮次数据），实现 Chainlink 的 AggregatorV3Interface 标准签名！
     * @return roundId 轮次 ID
     * @return answer 价格(需结合 decimals,如 1000.00 * 1e8)
     * @return startedAt 本轮开始时间
     * @return updatedAt 最近更新时间(防 stale 检查用)
     * @return answeredInRound 应答轮次
     */
    function latestRoundData() external view 
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // 直接返回写死的价格；时间戳用当前区块时间
        return (uint80(1), price, block.timestamp, block.timestamp, uint80(1));
    }

    /**
     * @notice 手动改价（模拟价格波动）
     * @param price_ 价格
     */
    function setPrice(int256 price_) external {
        price = price_;
    }

    /**
     * @notice 读当前价格
     */
    function getPrice() external view returns(int256) {
        return price;
    }
}