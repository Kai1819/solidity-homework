// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./MetaNFTAuctionTransparent.sol";

/**
 * @notice 透明代理版本3：新增「回收意外锁定 NFT」能力
 *
 * 背景：拍卖合约只会在 start() 时把 NFT 锁入（transferFrom 到合约），
 * 且只有存在对应 auctionId 记录时 end() 才能解锁。若发生
 * 「NFT 已转入合约但 auctions 无记录 / 无人出价无法 end()」等异常状态，
 * NFT 会永久锁死在合约里（无法取回）。
 *
 * 本版本提供 recoverNFT()，允许 owner（管理员）把合约当前持有的、
 * 且不属于任何有效拍卖的 NFT 取回，用于清理这类历史遗留资产。
 *
 * ⚠️ 安全提醒：recoverNFT 是管理员的"急救通道"，调用前请确认目标 NFT
 * 确实不处于正常拍卖中（否则会破坏拍卖流程）；正常场景不要使用。
 */
contract MetaNFTAuctionTransparentV3 is MetaNFTAuctionTransparent {
    // 事件：NFT 被回收
    event NFTRecovered(address indexed nft, uint256 indexed tokenId, address indexed to);

    constructor() {
        // 禁用初始器
        _disableInitializers();
    }

    /**
     * @notice 标注版本号
     */
    function getVersion() external pure virtual override returns (string memory) {
        return "MetaNFTAuctionTransparentV3";
    }

    /**
     * @notice 回收合约当前持有的 NFT（仅 owner 可调）
     * @param nft      NFT 合约地址（满足 IERC721）
     * @param tokenId  要回收的 tokenId
     * @param to       接收地址（建议管理员自己的地址）
     */
    function recoverNFT(address nft, uint256 tokenId, address to) external onlyOwner {
        require(to != address(0), "invalid receiver");
        // 校验合约确实持有该 NFT，避免凭空转出他人资产
        require(IERC721(nft).ownerOf(tokenId) == address(this), "not held");
        // 把 NFT 从合约转给接收者
        IERC721(nft).transferFrom(address(this), to, tokenId);
        emit NFTRecovered(nft, tokenId, to);
    }
}
