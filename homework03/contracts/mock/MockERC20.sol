// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @notice 模拟ERC20代币
 */
contract MockERC20 is ERC20, Ownable {
    // 自定义小数位（USDC 真实是 6 位，标准 ERC20 默认 18 位）
    // ETH/USD、USDC/USD 均为 8 位（即 1869.05 → 186905000000）
    uint8 private _decimals;

    // 事件：铸造代币
    event MintToken(address indexed to, uint256 amount);

    /**
     * @notice 构造器，初始化代币供应量
     * @param name_ 名称
     * @param symbol_ 符号
     * @param decimals_ 小数位
     * @param initialSupply_ 初始供应量
     */
    constructor(string memory name_, string memory symbol_, uint8 decimals_, uint256 initialSupply_) ERC20(name_, symbol_) Ownable(msg.sender){
        _decimals = decimals_;
        _mint(msg.sender, initialSupply_);
        emit MintToken(msg.sender, initialSupply_);
    }

    /**
     * @notice 覆盖默认 decimals（默认 18，这里允许自定义，模拟 USDC 的 6 位）
     */
    function decimals() public view virtual override returns(uint8){
        return _decimals;
    }

    /**
     * @notice 铸造代币，其他合约都可以无限铸造
     * @param to 接收地址
     * @param amount 铸造数量
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
        emit MintToken(to, amount);
    }
}