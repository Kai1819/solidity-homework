// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MockERC20} from "../contracts/mock/MockERC20.sol";
import {MockOracle} from "../contracts/mock/MockOracle.sol";

/**
 * Mock 合约 Foundry 测试
 * 覆盖：MockERC20（decimals/mint）与 MockOracle（latestRoundData/setPrice/getPrice）
 */
contract MockTest is Test {
    address alice = makeAddr("alice");

    function test_mockERC20_decimals_and_mint() public {
        MockERC20 usdc = new MockERC20("Mock USDC", "USDC", 6, 1000e6);
        assertEq(usdc.name(), "Mock USDC");
        assertEq(usdc.symbol(), "USDC");
        assertEq(usdc.decimals(), 6);
        // 部署者初始持币
        assertEq(usdc.balanceOf(address(this)), 1000e6);

        // mint 公开无权限
        usdc.mint(alice, 500e6);
        assertEq(usdc.balanceOf(alice), 500e6);
    }

    function test_mockOracle_latestRoundData() public {
        MockOracle oracle = new MockOracle(int256(2000e8));
        (uint80 roundId, int256 answer,,, uint80 answeredInRound) = oracle.latestRoundData();
        assertEq(roundId, 1);
        assertEq(answer, int256(2000e8));
        assertEq(answeredInRound, 1);
    }

    function test_mockOracle_setPrice_getPrice() public {
        MockOracle oracle = new MockOracle(int256(2000e8));
        assertEq(oracle.getPrice(), int256(2000e8));

        // 改价（模拟价格波动）
        oracle.setPrice(int256(3000e8));
        assertEq(oracle.getPrice(), int256(3000e8));
        (, int256 answer,,,) = oracle.latestRoundData();
        assertEq(answer, int256(3000e8));
    }
}
