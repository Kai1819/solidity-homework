// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

/**
 * @notice 拍卖原始NFT
 */
contract MetaNFT is ERC721 , ERC721Burnable ,Ownable {
    // 自增Id
    uint256 private _netxtId = 1;

    // 一个tokenId对应一个原数据URI
    mapping(uint256 => string) private _tokenURIs;

    // 事件：铸造新 NFT
    event MintNftToken(address indexed to, uint256 indexed tokenId, string tokenURI);

    /**
     * @notice 初始化构造器：name和symbol两个参数
     */
    constructor() ERC721("MetaNFT", "MNFT") Ownable(msg.sender) {}

    /**
     * @notice 由 owner 铸造一个NFT 给指定地址
     * @param to 接受者地址
     * @param tokenURI_ 该token的元数据 URI
     */
    function mint(address to, string memory tokenURI_) external onlyOwner returns (uint256) {
        // 赋值
        uint256 tokenId = _netxtId;
        // 铸造
        _mint(to, tokenId);
        // 设置URI
        _tokenURIs[tokenId] = tokenURI_;
        // 自增
        _netxtId++;
        // 发送事件
        emit MintNftToken(to, tokenId, tokenURI_);
        // 返回tokenId
        return tokenId;
    }

    /**
     * @notice 返回某 token 的元数据 URI
     * @param tokenId 目标tokenId
     * @return 元数据 URI 字符串
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return _tokenURIs[tokenId];
    }

    // 销毁NFT，直接用 ERC721Burnable 的 burn


    

}