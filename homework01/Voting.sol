// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

//   1.  创建一个名为Voting的合约，包含以下功能：
// - 一个mapping来存储候选人的得票数
// - 一个vote函数，允许用户投票给某个候选人
// - 一个getVotes函数，返回某个候选人的得票数
// - 一个resetVotes函数，重置所有候选人的得票数

// 本质：一人在整个选举中只能投一票
contract Voting{
    // 候选人得票数：候选人名字 -> 票数
    mapping(string => uint256) public votedNum;
    // 用户是否投票：用户地址 -> 是否投票
    mapping(address => bool) public hasVoted;
    // 候选人数组
    string[] candidateList;
    // 候选人是否存在:候选人名字 -> 存在与否
    mapping(string => bool) public existCandidate;
    // 用户数组
    address[] userList;
    // 用户是否存在:用户地址 -> 存在与否
    mapping(address => bool) public existUser;
    // 管理员
    address owner;

    // 事件
    event Voted(address indexed voter, string candidate);
    event VotesReset(uint256 at);

    // 构造器
    constructor(){
        owner = msg.sender;
    }

    // 修饰符
    modifier onlyOwner(){
        require(msg.sender==owner,"Only Owner");
        _;
    }

    // 用户投票给候选人
    function vote(string calldata _name) external {
        // 对当前用户前置判断
        address user = msg.sender;
        require(!hasVoted[user],"Already Voted");

        // 候选人是否存在
        if(!existCandidate[_name]){
            candidateList.push(_name);
            existCandidate[_name] = true;
        }
        // 用户是否存在
        if (!existUser[msg.sender]) {       
            userList.push(user);
            existUser[user] = true;
        }

        hasVoted[user] = true;
        votedNum[_name] ++ ;

        emit Voted(msg.sender, _name);
    }

    // 获取候选人的得票数
    function getVotes(string calldata _name) external view returns(uint256){
        return votedNum[_name];
    }

    // 重置所有候选人的得票数
    function resetVotes() public onlyOwner {
        // 票数清零&候选人是否存在置空
        for(uint256 i = 0; i < candidateList.length; i++){
            delete votedNum[candidateList[i]];
            delete existCandidate[candidateList[i]];
        }
        delete candidateList;

        // 是否投票清零
        for(uint256 i = 0; i < userList.length; i++){
            delete hasVoted[userList[i]];
            delete existUser[userList[i]];
        }
        delete userList;

        emit VotesReset(block.timestamp);

    }


}