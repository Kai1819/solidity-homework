// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MetaNFT} from "../contracts/MetaNFT.sol";
import {MockERC20} from "../contracts/mock/MockERC20.sol";
import {MockOracle} from "../contracts/mock/MockOracle.sol";
import {MetaNFTAuctionBase} from "../contracts/MetaNFTAuctionBase.sol";
import {MetaNFTAuctionTransparent} from "../contracts/MetaNFTAuctionTransparent.sol";
import {MetaNFTAuctionTransparentV2} from "../contracts/MetaNFTAuctionTransparentV2.sol";
import {MetaNFTAuctionTransparentV3} from "../contracts/MetaNFTAuctionTransparentV3.sol";
import {TransparentUpgradeableProxy, ITransparentUpgradeableProxy} from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import {ProxyAdmin} from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";

/**
 * 拍卖核心 + 透明代理升级 Foundry 集成测试
 * 覆盖：V1 版本、start/bid/end 全流程（ETH 与 USDC 双模式）、升级 V2、升级 V3 + recoverNFT
 * 对应 TS 版 test/MetaNFTAuctionTransparent.test.ts
 */
contract MetaNFTAuctionTransparentTest is Test {
    MetaNFTAuctionTransparent auction;
    MetaNFT nft;
    MockERC20 usdc;
    MockOracle ethOracle;
    MockOracle usdcOracle;
    TransparentUpgradeableProxy proxy;
    address owner = makeAddr("owner");
    address seller = makeAddr("seller");
    address bidder1 = makeAddr("bidder1");
    address bidder2 = makeAddr("bidder2");

    uint256 constant STARTING_PRICE = 1000; // $1000（入参整数）
    uint256 constant DURATION = 60; // 秒

    function setUp() public {
        vm.startPrank(owner);
        // 1) 部署透明代理：实现 + TransparentUpgradeableProxy(impl, initialOwner, initData)
        MetaNFTAuctionTransparent impl = new MetaNFTAuctionTransparent();
        bytes memory initData = abi.encodeCall(MetaNFTAuctionTransparent.initialize, (owner));
        proxy = new TransparentUpgradeableProxy(address(impl), owner, initData);
        auction = MetaNFTAuctionTransparent(address(proxy));

        // 2) 部署辅助合约
        nft = new MetaNFT();
        usdc = new MockERC20("Mock USDC", "USDC", 6, 100000e6);
        ethOracle = new MockOracle(int256(2000e8)); // ETH/USD = $2000
        usdcOracle = new MockOracle(int256(1e8)); // USDC/USD = $1

        // 3) 注册预言机
        auction.setTokenOracle(address(0), address(ethOracle));
        auction.setTokenOracle(address(usdc), address(usdcOracle));
        vm.stopPrank();

        // 4) 铸造 NFT 给卖家并授权拍卖合约
        vm.prank(owner);
        nft.mint(seller, "ipfs://nft/1");
        vm.prank(seller);
        nft.setApprovalForAll(address(proxy), true);

        // 5) 给买家 USDC 并授权
        vm.prank(owner);
        usdc.mint(bidder1, 100000e6);
        vm.prank(bidder1);
        usdc.approve(address(proxy), type(uint256).max);
    }

    // ---------- V1 版本 ----------

    function test_initial_version() public view {
        assertEq(auction.getVersion(), "MetaNFTAuctionTransparentV1");
    }

    // ---------- start ----------

    function test_start_owner() public {
        vm.prank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));

        assertEq(auction.auctionId(), 1);
        // NFT 已锁入合约
        assertEq(nft.ownerOf(1), address(proxy));
    }

    function test_start_nonOwner_reverts() public {
        vm.expectRevert(bytes("not owner"));
        vm.prank(seller);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));
    }

    function test_start_durationTooShort_reverts() public {
        vm.expectRevert(bytes("invalidate duration"));
        vm.prank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, 29, address(usdc));
    }

    // ---------- bid（USDC） ----------

    function test_bid_usdc() public {
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));
        vm.stopPrank();

        vm.prank(bidder1);
        auction.bid(0, 2000e6); // 2000 USDC

        (
            IERC721 nftAddr,
            uint256 nftId_,
            address payable sellerAddr,
            address highestBidder_,
            uint256 startingTime_,
            uint256 duration_,
            IERC20 paymentToken_,
            uint256 startingPriceInDollar_,
            uint256 highestBid_,
            uint256 highestBidInDollar_,
            address highestBidToken_
        ) = auction.auctions(0);
        assertEq(highestBid_, 2000e6, unicode"highestBid 应为 2000 USDC 最小单位");
        // 2000 USDC × $1 = $2000（1e8 位）
        assertEq(highestBidInDollar_, 2000e8);
        assertEq(highestBidder_, bidder1);
    }

    function test_bid_belowStartingPrice_reverts() public {
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));
        vm.stopPrank();

        // $1000 起拍，出 $500（500 USDC）应被拒
        vm.expectRevert(bytes("invalid startingPrice"));
        vm.prank(bidder1);
        auction.bid(0, 500e6);
    }

    function test_bid_higherReplacesAndRefunds() public {
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));
        vm.stopPrank();

        // bidder2 也准备 USDC
        vm.prank(owner);
        usdc.mint(bidder2, 100000e6);
        vm.prank(bidder2);
        usdc.approve(address(proxy), type(uint256).max);

        vm.prank(bidder1);
        auction.bid(0, 2000e6);
        // bidder2 出 3000 USDC，bidder1 的 2000 应退回
        vm.prank(bidder2);
        auction.bid(0, 3000e6);

        (
            IERC721 nftAddr,
            uint256 nftId_,
            address payable sellerAddr,
            address highestBidder_,
            uint256 startingTime_,
            uint256 duration_,
            IERC20 paymentToken_,
            uint256 startingPriceInDollar_,
            uint256 highestBid_,
            uint256 highestBidInDollar_,
            address highestBidToken_
        ) = auction.auctions(0);
        assertEq(highestBidder_, bidder2);
        // bidder1 余额恢复（初始 100000，出 2000，退 2000）
        assertEq(usdc.balanceOf(bidder1), 100000e6);
    }

    // ---------- bid（ETH） ----------

    function test_bid_eth() public {
        // ETH 拍卖：paymentToken = address(0)
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(0));
        vm.stopPrank();

        // 给 bidder1 提供 ETH，出 1 ETH（$2000），msg.value == amount
        vm.deal(bidder1, 10 ether);
        vm.prank(bidder1);
        auction.bid{value: 1 ether}(0, 1 ether);

        (
            IERC721 nftAddr,
            uint256 nftId_,
            address payable sellerAddr,
            address highestBidder_,
            uint256 startingTime_,
            uint256 duration_,
            IERC20 paymentToken_,
            uint256 startingPriceInDollar_,
            uint256 highestBid_,
            uint256 highestBidInDollar_,
            address highestBidToken_
        ) = auction.auctions(0);
        assertEq(highestBid_, 1 ether);
        assertEq(highestBidInDollar_, 2000e8, unicode"1 ETH × $2000 = $2000（1e8 位）");
    }

    function test_bid_eth_amountMismatch_reverts() public {
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(0));
        vm.stopPrank();

        // amount 与 msg.value 不一致
        vm.deal(bidder1, 10 ether);
        vm.expectRevert(bytes("amount mismatch"));
        vm.prank(bidder1);
        auction.bid{value: 1 ether}(0, 2 ether);
    }

    // ---------- end ----------

    function test_end_settles() public {
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));
        vm.stopPrank();

        vm.prank(bidder1);
        auction.bid(0, 2000e6);

        // 推进时间到拍卖结束
        vm.warp(block.timestamp + DURATION + 1);
        vm.prank(seller);
        auction.end(0);

        // NFT → 买家，拍款 → 卖家
        assertEq(nft.ownerOf(1), bidder1);
        assertEq(usdc.balanceOf(seller), 2000e6);
    }

    function test_end_notEnded_reverts() public {
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));
        vm.stopPrank();

        vm.expectRevert(bytes("not ended"));
        vm.prank(seller);
        auction.end(0);
    }

    function test_end_noBids_reverts() public {
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));
        vm.stopPrank();

        vm.warp(block.timestamp + DURATION + 1);
        vm.expectRevert(bytes("no bids"));
        vm.prank(seller);
        auction.end(0);
    }

    // ---------- 升级 V2 ----------

    function test_upgrade_v2() public {
        // new 合约会消耗 vm.prank，升级调用需显式以 owner 身份执行
        MetaNFTAuctionTransparentV2 implV2 = new MetaNFTAuctionTransparentV2();
        // 读取代理内部 ProxyAdmin（EIP-1967 admin 槽位）
        ProxyAdmin proxyAdmin = ProxyAdmin(_proxyAdminAddress());
        vm.prank(owner);
        proxyAdmin.upgradeAndCall(ITransparentUpgradeableProxy(address(proxy)), address(implV2), "");

        MetaNFTAuctionTransparentV2 auctionV2 = MetaNFTAuctionTransparentV2(address(proxy));
        assertEq(auctionV2.getVersion(), "MetaNFTAuctionTransparentV2");
        assertEq(auctionV2.newFeature(), "This is a new feature in V2");
    }

    function test_upgrade_v2_preservesState() public {
        // 先启动一场拍卖
        vm.startPrank(owner);
        auction.start(seller, 1, address(nft), STARTING_PRICE, DURATION, address(usdc));
        vm.stopPrank();

        MetaNFTAuctionTransparentV2 implV2 = new MetaNFTAuctionTransparentV2();
        ProxyAdmin proxyAdmin = ProxyAdmin(_proxyAdminAddress());
        vm.prank(owner);
        proxyAdmin.upgradeAndCall(ITransparentUpgradeableProxy(address(proxy)), address(implV2), "");

        // 升级后状态保留
        MetaNFTAuctionTransparentV2 auctionV2 = MetaNFTAuctionTransparentV2(address(proxy));
        assertEq(auctionV2.auctionId(), 1);
        assertEq(auctionV2.tokenToOracle(address(usdc)), address(usdcOracle));
    }

    // ---------- 升级 V3 + recoverNFT ----------

    function test_upgrade_v3_recoverNFT() public {
        MetaNFTAuctionTransparentV3 implV3 = new MetaNFTAuctionTransparentV3();
        ProxyAdmin proxyAdmin = ProxyAdmin(_proxyAdminAddress());
        vm.prank(owner);
        proxyAdmin.upgradeAndCall(ITransparentUpgradeableProxy(address(proxy)), address(implV3), "");

        MetaNFTAuctionTransparentV3 auctionV3 = MetaNFTAuctionTransparentV3(address(proxy));
        assertEq(auctionV3.getVersion(), "MetaNFTAuctionTransparentV3");

        // 模拟意外锁定：铸造 NFT#2 直接转入代理（无拍卖记录）
        vm.startPrank(owner);
        nft.mint(owner, "ipfs://locked/2");
        nft.transferFrom(owner, address(proxy), 2);
        vm.stopPrank();
        assertEq(nft.ownerOf(2), address(proxy));

        // 回收 NFT#2 给 receiver
        address receiver = makeAddr("receiver");
        vm.expectEmit(true, true, true, true, address(proxy));
        emit MetaNFTAuctionTransparentV3.NFTRecovered(address(nft), 2, receiver);
        vm.prank(owner);
        auctionV3.recoverNFT(address(nft), 2, receiver);
        assertEq(nft.ownerOf(2), receiver);
    }

    function test_recoverNFT_notHeld_reverts() public {
        MetaNFTAuctionTransparentV3 implV3 = new MetaNFTAuctionTransparentV3();
        ProxyAdmin proxyAdmin = ProxyAdmin(_proxyAdminAddress());
        vm.prank(owner);
        proxyAdmin.upgradeAndCall(ITransparentUpgradeableProxy(address(proxy)), address(implV3), "");

        MetaNFTAuctionTransparentV3 auctionV3 = MetaNFTAuctionTransparentV3(address(proxy));
        // NFT#1 属于卖家（不在代理手里），回收应 revert
        vm.expectRevert(bytes("not held"));
        vm.prank(owner);
        auctionV3.recoverNFT(address(nft), 1, owner);
    }

    // ---------- 辅助 ----------

    /// 读取 EIP-1967 admin 槽位获取内部 ProxyAdmin 地址
    function _proxyAdminAddress() internal view returns (address) {
        bytes32 adminSlot = bytes32(
            uint256(0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103)
        );
        return address(uint160(uint256(vm.load(address(proxy), adminSlot))));
    }
}
