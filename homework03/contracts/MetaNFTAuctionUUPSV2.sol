// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./MetaNFTAuctionUUPS.sol";

/**
 * @notice UUPS代理版本2
 */
contract MetaNFTAuctionUUPSV2 is MetaNFTAuctionUUPS {
    /**
     * @notice 
     */
    constructor() {
        // 禁用初始器
        _disableInitializers();
    }

    /**
     * @notice 模拟实现新功能
     */
    function newFeature() external pure returns (string memory) {
        return "This is a new feature in UUPS V2";
    }

    /**
     * @notice 标注版本号
     */
    function getVersion() external pure virtual override returns (string memory){
        return "MetaNFTAuctionUUPSV2";
    }



}