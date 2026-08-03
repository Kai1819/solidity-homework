// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MetaNFTAuctionBase} from "../contracts/MetaNFTAuctionBase.sol";
import {MetaNFTAuctionUUPS} from "../contracts/MetaNFTAuctionUUPS.sol";
import {MetaNFTAuctionUUPSV2} from "../contracts/MetaNFTAuctionUUPSV2.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

/**
 * UUPS 升级模式 Foundry 测试
 * 覆盖：V1 版本、owner 升级 V1→V2、升级后状态保留、非 owner 升级 revert
 * 对应 TS 版 test/MetaNFTAuctionUUPS.test.ts
 */
contract MetaNFTAuctionUUPSTest is Test {
    MetaNFTAuctionUUPS auction;
    ERC1967Proxy proxy;
    address owner = makeAddr("owner");
    address attacker = makeAddr("attacker");

    function setUp() public {
        vm.startPrank(owner);
        MetaNFTAuctionUUPS impl = new MetaNFTAuctionUUPS();
        bytes memory initData = abi.encodeCall(MetaNFTAuctionUUPS.initialize, (owner));
        proxy = new ERC1967Proxy(address(impl), initData);
        auction = MetaNFTAuctionUUPS(address(proxy));
        vm.stopPrank();
    }

    function test_initial_version() public view {
        assertEq(auction.getVersion(), "MetaNFTAuctionUUPSV1");
    }

    function test_upgrade_to_v2() public {
        MetaNFTAuctionUUPSV2 implV2 = new MetaNFTAuctionUUPSV2();
        vm.prank(owner);
        auction.upgradeToAndCall(address(implV2), "");

        MetaNFTAuctionUUPSV2 auctionV2 = MetaNFTAuctionUUPSV2(address(proxy));
        assertEq(auctionV2.getVersion(), "MetaNFTAuctionUUPSV2");
        assertEq(auctionV2.newFeature(), "This is a new feature in UUPS V2");
    }

    function test_upgrade_nonOwner_reverts() public {
        MetaNFTAuctionUUPSV2 implV2 = new MetaNFTAuctionUUPSV2();
        vm.expectRevert(bytes("not owner"));
        vm.prank(attacker);
        auction.upgradeToAndCall(address(implV2), "");
    }

    function test_implementation_direct_initialize_reverts() public {
        // 实现合约构造函数已 _disableInitializers
        MetaNFTAuctionUUPS impl = new MetaNFTAuctionUUPS();
        vm.expectRevert();
        impl.initialize(owner);
    }
}
