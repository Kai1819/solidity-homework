// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MetaNFTAuctionTransparent.sol";

/**
 * @notice 透明代理版本2
 */
contract MetaNFTAuctionTransparentV2 is MetaNFTAuctionTransparent{
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
        return "This is a new feature in V2";
    }

    /**
     * @notice 标注版本号
     */
    function getVersion() external pure virtual override returns (string memory){
        return "MetaNFTAuctionTransparentV2";
    }




}