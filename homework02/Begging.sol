// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Begging{
    // 任务目标
    // 1. 使用 Solidity 编写一个合约，允许用户向合约地址发送以太币。
    // 2. 记录每个捐赠者的地址和捐赠金额。
    // 3. 允许合约所有者提取所有捐赠的资金。

    // 任务步骤
    // 1. 编写合约
    //   - 创建一个名为 BeggingContract 的合约。
    //   - 合约应包含以下功能：
    //   - 一个 mapping 来记录每个捐赠者的捐赠金额。
    //   - 一个 donate 函数，允许用户向合约发送以太币，并记录捐赠信息。
    //   - 一个 withdraw 函数，允许合约所有者提取所有资金。
    //   - 一个 getDonation 函数，允许查询某个地址的捐赠金额。
    //   - 使用 payable 修饰符和 address.transfer 实现支付和提款。
    // 2. 部署合约
    //   - 在 Remix IDE 中编译合约。
    //   - 部署合约到 Goerli 或 Sepolia 测试网。
    // 3. 测试合约
    //   - 使用 MetaMask 向合约发送以太币，测试 donate 功能。
    //   - 调用 withdraw 函数，测试合约所有者是否可以提取资金。
    //   - 调用 getDonation 函数，查询某个地址的捐赠金额。

    // 任务要求
    // 1. 合约代码：
    //   - 使用 mapping 记录捐赠者的地址和金额。
    //   - 使用 payable 修饰符实现 donate 和 withdraw 函数。
    //   - 使用 onlyOwner 修饰符限制 withdraw 函数只能由合约所有者调用。
    // 2. 测试网部署：
    //   - 合约必须部署到 Goerli 或 Sepolia 测试网。
    // 3. 功能测试：
    //   - 确保 donate、withdraw 和 getDonation 函数正常工作。

    // 提交内容
    // 1. 合约代码：提交 Solidity 合约文件（如 BeggingContract.sol）。
    // 2. 合约地址：提交部署到测试网的合约地址。
    // 3. 测试截图：提交在 Remix 或 Etherscan 上测试合约的截图。

    // 额外挑战（可选）
    // 1. 捐赠事件：添加 Donation 事件，记录每次捐赠的地址和金额。
    // 2. 捐赠排行榜：实现一个功能，显示捐赠金额最多的前 3 个地址。
    // 3. 时间限制：添加一个时间限制，只有在特定时间段内才能捐赠。

    mapping(address => uint256) public donationBalance;
    address public owner;
    uint256 public deadline ;

    event Donation(address donor,uint256 amount);

    constructor(){
        owner = msg.sender;
        deadline = block.timestamp + (7 days);
    }

    modifier onlyOwner(){
        require(msg.sender == owner, "Not Owner");
        _;
    }

    modifier donateTime(){
        require(block.timestamp <= deadline,"Not Donate Time");
        _;
    }

    // 捐款
    // ETH 通过 msg.value 自动进入合约；payable 默认接收 msg.value 金额
    function donate() payable public donateTime {
        uint256 amount = msg.value;
        require(amount > 0, " Amount Is Zero");
        donationBalance[msg.sender] += amount;
        emit Donation(msg.sender, amount);
    }

    // 提现
    // 不加关键字 payable，没有收款功能，并且msg.value设置为0
    function withdraw() public onlyOwner {
        require(address(this).balance > 0, "No Balance");
        // payable修饰可收款；owner可收款，将本合约的金额转给owner
        // transfer 由"接收方"来调用，但钱是从当前合约余额里出的。括号里的 address(this).balance 就是要转的金额
        payable(owner).transfer(address(this).balance);
    }

    // 查询
    function getDonation(address donor) external view returns(uint256) {
        return donationBalance[donor];
    }

}