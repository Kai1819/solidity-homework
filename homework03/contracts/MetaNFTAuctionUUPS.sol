// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./MetaNFTAuctionBase.sol";

/**
 * @notice UUPS代理版本1
 */
contract MetaNFTAuctionUUPS is Initializable, MetaNFTAuctionBase, UUPSUpgradeable {
    /**
     * @notice 
     */
    constructor() {
        // 禁用初始器
        _disableInitializers();
    }

     /**
     * @notice 代理初始化入口
     * @param owner_ 管理员
     */
    function initialize(address owner_) public initializer {
        _initialize(owner_);
    }

    /**
     * @notice 标注版本号
     */
    function getVersion() external pure virtual returns (string memory){
        return "MetaNFTAuctionUUPSV1";
    }

    /**
     * @notice 升级授权：仅owner 可升级（UUPS 升级逻辑在实现合约内）
     * @param 部署地址
     */
    function _authorizeUpgrade(address) internal override onlyOwner {}



}