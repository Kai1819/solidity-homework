// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./MetaNFTAuctionBase.sol";

/**
 * @notice 透明代理版本1
 */
contract MetaNFTAuctionTransparent is Initializable ,MetaNFTAuctionBase {
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
        return "MetaNFTAuctionTransparentV1";
    }

    // 注意：不实现任何 upgrade 函数。
    // 升级由外部 ProxyAdmin 通过 upgradeAndCall 发起，代理层会把 admin 函数路由到 ProxyAdmin，
    // 非 admin 调用会被代理层拦截（落到实现合约 fallback），本合约不暴露升级逻辑。
}