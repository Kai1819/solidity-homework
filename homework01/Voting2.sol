// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

//   1.  创建一个名为Voting的合约，包含以下功能：
// - 一个mapping来存储候选人的得票数
// - 一个vote函数，允许用户投票给某个候选人
// - 一个getVotes函数，返回某个候选人的得票数
// - 一个resetVotes函数，重置所有候选人的得票数

// 本质：一人在一个候选人中只能投一票
contract Voting2 {
    // 候选人得票映射：候选人名字 => 得票数（public 会自动生成只读 getter）
    mapping(string => uint256) public votedNum;
    // 二维映射：用户地址 => (候选人名字 => 是否已投)，用于实现"每人对每候选人限一票"
    mapping(address => mapping(string => bool)) public votedFor;
    // 候选人数组：记录所有出现过的候选人，供 resetVotes 遍历清空
    string[]  private candidateList;
    // 候选人存在标记：名字 => 是否存在（用于新候选人去重）
    mapping(string => bool) public existCandidate;
    // 用户数组：记录所有参与过投票的用户，供 resetVotes 遍历清空
    address[] private userList;
    // 用户入列标记：地址 => 是否已加入 userList（避免同一人重复入列导致数组膨胀）
    mapping(address => bool) private _inUserList;
    // 合约管理员地址（部署者），用于权限控制
    address public owner;

    // 投票事件：记录"谁投了哪个候选人"，前端可监听
    event Voted(address indexed voter, string candidate);
    // 重置事件：记录重置发生的时间戳
    event VotesReset(uint256 at);

    // 构造函数：合约部署时自动执行一次
    constructor() {
        // 把部署者地址设为管理员
        owner = msg.sender;
    }

    // 修饰器：限制函数只能由管理员调用
    modifier onlyOwner() {
        // 校验调用者是否为管理员，否则报错并回滚交易
        require(msg.sender == owner, "Only Owner");
        // 占位符：插入被修饰函数的原始代码
        _;
    }

    // 投票函数：外部用户调用（external 比 public 更省 gas）
    function vote(string calldata _name) external {
        // 校验该用户是否已给这个候选人投过票，投过则拒绝（实现单候选人限一票）
        require(!votedFor[msg.sender][_name], "Already voted for this candidate");

        // 如果该候选人还没被记录过
        if (!existCandidate[_name]) {
            // 把候选人加入候选人数组
            candidateList.push(_name);
            // 标记该候选人已存在，防止重复入列
            existCandidate[_name] = true;
        }
        // 如果该用户还没进入用户列表
        if (!_inUserList[msg.sender]) {
            // 把用户加入用户数组
            userList.push(msg.sender);
            // 标记已入列，避免重复入列导致数组膨胀
            _inUserList[msg.sender] = true;
        }

        // 记录：该用户已投该候选人
        votedFor[msg.sender][_name] = true;
        // 该候选人得票数 +1
        votedNum[_name]++;
        // 发出投票事件，便于前端/链下监听
        emit Voted(msg.sender, _name);
    }

    // 查询函数：返回某候选人的得票数（view 表示只读、不消耗 gas）
    function getVotes(string calldata _name) external view returns (uint256) {
        // 直接返回映射中存储的票数（未投票的候选人读取时为 0）
        return votedNum[_name];
    }

    // 重置函数：仅管理员可调用（onlyOwner 修饰器做权限校验）
    function resetVotes() external onlyOwner {
        // 外层循环：遍历每一个候选人
        for (uint256 i = 0; i < candidateList.length; i++) {
            // 取出当前候选人名字（存到 memory，减少重复读取 storage 的消耗）
            string memory c = candidateList[i];
            // 清空该候选人的得票数
            delete votedNum[c];
            // 清除该候选人的存在标记
            delete existCandidate[c];
            // 内层循环：遍历每一个用户
            for (uint256 j = 0; j < userList.length; j++) {
                // 清除"该用户投过该候选人"的记录（清二维映射的对应条目）
                delete votedFor[userList[j]][c];
            }
        }
        // 清空候选人数组（length 归 0）
        delete candidateList;

        // 遍历用户列表，清除"已入列"标记，供下一轮重新登记
        for (uint256 j = 0; j < userList.length; j++) {
            delete _inUserList[userList[j]];
        }
        // 清空用户数组
        delete userList;

        // 发出重置事件，记录重置发生的时间
        emit VotesReset(block.timestamp);
    }
}