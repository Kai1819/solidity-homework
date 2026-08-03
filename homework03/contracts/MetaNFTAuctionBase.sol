// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";


/**
 * @notice MetaNFTAuction 基础类
 */
abstract contract MetaNFTAuctionBase is Initializable {
    // 拍卖详情：NFT和代币都采用接口化编程：IERC721、IERC20；方便注入链上地址
    struct Auction {
        // NFT 合约地址
        IERC721 nft;
        // 拍卖的NFT tokenId
        uint256 nftId;

        // 卖家
        address payable seller;
        // 买家：当前最高出价者
        address highestBidder;

        // 拍卖开始时间戳
        uint256 startingTime;
        // 拍卖时常(秒)
        uint256 duration;

        // 出价用的Token代币
        IERC20 paymentToken;
        // 起拍价
        uint256 startingPriceInDollar;
        // 当前最高出价
        uint256 highestBid;
        // 最高出价折合美元
        uint256 highestBidInDollar;
        // 最高出价用的代币
        address highestBidToken;
    }
    // 管理员
    address owner;
    // 币种 => 预言机地址
    mapping(address => address) public tokenToOracle;
    // 拍品ID => 拍卖详情
    mapping(uint256 => Auction) public auctions; 
    // 拍品ID
    uint256 public auctionId;

    // 修饰符
    modifier onlyOwner(){
        require(msg.sender == owner, "not owner");
        _;
    }

    /**
     * @notice 初始化，逻辑写在这个函数
     * @param owner_ 部署者
     */
    function _initialize(address owner_) internal onlyInitializing {
        owner = owner_;
    }

    // 事件
    // 拍卖启动：拍品ID
    event StartBid(uint256 auctionId);
    // 出价：出价人、金额
    event Bid(address indexed sender, uint256 amount);
    // 拍卖结束：拍品ID
    event EndBid(uint256 indexed auctionId);

    /**
     * @notice 设置代币预言机
     * @param token 符合ERC20的代币地址
     * @param oracle 符合ChainLink AggregatorV3Interface 签名的预言机地址
     */
    function setTokenOracle(address token, address oracle) external onlyOwner {
        require(oracle != address(0), "invalid oracle");
        tokenToOracle[token] = oracle;
    }

    /**
     * 卖家发起拍卖 (初始化拍品)，只有部署员有权限
     * @param seller 卖家
     * @param nftId  nftId
     * @param nft    nft，满足IERC721
     * @param startingPriceInDollar 起拍价
     * @param duration 拍卖期间
     * @param paymentToken 代币，满足IERC20
     */
    function start(
        address seller,
        uint256 nftId,
        address nft,
        uint256 startingPriceInDollar,
        uint256 duration,
        address paymentToken
    ) external onlyOwner {
        require(nft != address(0), "invalid nft");
        require(duration >= 30, "invalidate duration");
        // 拍品详情进行数据初始化并保存到map中
        Auction storage auction = auctions[auctionId];
        auction.nft = IERC721(nft);
        auction.nftId = nftId;
        auction.seller = payable(seller);
        auction.startingTime = block.timestamp;
        auction.startingPriceInDollar = startingPriceInDollar * 10**8;
        auction.duration = duration;
        auction.paymentToken = IERC20(paymentToken);
        auction.highestBid = 0;
        auction.highestBidder = address(0);
        auction.highestBidInDollar = 0;
        auction.highestBidToken = address(0);

        // 调用权限规则(谁能转): 不是只有持有者能调——以下三类人都可以:
        // 持有者本人 from
        // 被授权者:持有者调用 approve(to, tokenId) 单独授权给某人/某合约
        // 操作员(operator):持有者调用 setApprovalForAll(operator, true) 批量授权(一个地址可以操作他的全部 NFT)

        // 前提：卖家先授权给合约，合约调用把NFT从卖家转入自身托管，锁仓：防止拍卖期间被卖家用掉
        IERC721(nft).transferFrom(seller, address(this), nftId);

        auctionId++;
        emit StartBid(auctionId);
    }

    /**
     * 买家发起竞拍
     * @param auctionId_ 拍品id
     * @param amount 竞价
     */
    function bid(uint256 auctionId_, uint256 amount) external payable {
        Auction storage auction = auctions[auctionId_];
        require(auction.startingTime > 0, "not started");
        require(!isEnded(auctionId_), "ended");
        // 竞拍价
        uint256 bidPrice;
        // 支付代币地址
        address paymentToken = address(auction.paymentToken);
        // 大于0就是ETH出价
        bool isEthBid = msg.value > 0;
        // ETH出价
        if (isEthBid) {
            // 竞价必须等于实际转到ETH
            require(amount == msg.value, "amount mismatch");
            uint256 price = getPriceInDollar(address(0));
            bidPrice = _toUsd(amount, 18, price); 
        }
        // ERC20出价
        else {
            require(amount > 0, "invalid amount");
            uint256 price = getPriceInDollar(paymentToken);
            uint8 tokenDecimals = IERC20Metadata(paymentToken).decimals();
            bidPrice = _toUsd(amount, tokenDecimals, price);
            // 划走代币，锁入本合约
            IERC20(paymentToken).transferFrom(msg.sender, address(this), amount);
        }
        // 高于起拍价
        require(auction.startingPriceInDollar < bidPrice , "invalid startingPrice");
        // 高于当前最高价
        require(auction.highestBidInDollar < bidPrice, "invalid highestBid");
        // 给上一个最高价退款
        if(auction.highestBidder != address(0) && auction.highestBidder != msg.sender) {
            uint256 refundAmount = auction.highestBid;
            if(refundAmount >0){
                if (auction.highestBidToken == address(0)) {
                    // 退ETH
                    payable(auction.highestBidder).transfer(refundAmount);
                }else {
                    // 退ERC20
                    IERC20(paymentToken).transfer(auction.highestBidder, refundAmount);
                }
            }
        }
        // 赋值
        if (isEthBid){
            auction.highestBid = msg.value;
            auction.highestBidToken = address(0);
        }else {
            auction.highestBid = amount;
            auction.highestBidToken = paymentToken;
        }
        auction.highestBidder = msg.sender;
        auction.highestBidInDollar = bidPrice;
        emit Bid(msg.sender, msg.value);
    }

    /**
     * 结束拍卖
     * @param auctionId_ 拍品id
     */
    function end(uint256 auctionId_) external {
        Auction storage auction = auctions[auctionId_];
        require(isEnded(auctionId_),"not ended");
        require(auction.highestBidder != address(0), "no bids");

        // NFT -> 买家
        // 锁在合约里的NFT转给最高出价者
        auction.nft.transferFrom(address(this), auction.highestBidder, auction.nftId);

        if (auction.highestBid > 0){
            if(auction.highestBidToken == address(0)){
                // 拍款 -> 卖家（ETH）
                payable(auction.seller).transfer(auction.highestBid);
            }else {
                // 拍款 -> 卖家（ERC20）
                IERC20(auction.highestBidToken).transfer(auction.seller, auction.highestBid);
            }
        }

        emit EndBid(auctionId_);
    }

    /**
     * @notice 拍品是否结束
     * @param auctionId_ 拍品Id
     */
    function isEnded(uint256 auctionId_) public view returns (bool) {
        Auction storage auction = auctions[auctionId_];
        return auction.startingTime >0 && block.timestamp >= auction.startingTime + auction.duration;
    }

    /**
     * 从预言机中获取价格，通过接口交互
     * @param token 代币地址
     */
    function getPriceInDollar(address token) public view returns (uint256){
        // 预言机标准接口
        AggregatorV3Interface dataFeed;
        // 获取预言机地址
        address oracle = tokenToOracle[token];
        require(oracle != address(0), "oracle not set");
        // 地址转标准化接口
        dataFeed = AggregatorV3Interface(oracle);
        // 获取最新轮次数据
        (
            , //uint80 roundId, 
            int256 answer
            , //uint256 startedAt, 
            , //uint256 updatedAt, 
            , //uint80 answeredInRound
            
        ) = dataFeed.latestRoundData();
        return uint256(answer);
    }
    /**
     * 金额统一转换为美元
     * @param amount 金额
     * @param amountDecimals 金额对应小数位
     * @param price 价格
     */
    function _toUsd(uint256 amount, uint256 amountDecimals, uint256 price) internal pure returns (uint256){
        uint256 scale = 10 ** amountDecimals;
        uint256 usd = (amount * price) / scale;
        return usd;
    }

}