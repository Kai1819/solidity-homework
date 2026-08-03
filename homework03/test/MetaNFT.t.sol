// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MetaNFT} from "../contracts/MetaNFT.sol";

/**
 * MetaNFT（ERC721）Foundry 单元测试
 * 对应 TS 版 test/MetaNFT.test.ts 的核心断言
 */
contract MetaNFTTest is Test {
    MetaNFT nft;
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    function setUp() public {
        // MetaNFT 构造时 Ownable(msg.sender)，用 vm.prank 让 owner 成为部署者
        vm.prank(owner);
        nft = new MetaNFT();
    }

    function test_constructor() public view {
        assertEq(nft.name(), "MetaNFT");
        assertEq(nft.symbol(), "MNFT");
        assertEq(nft.owner(), owner);
    }

    function test_mint_onlyOwner_and_tokenIdIncrement() public {
        vm.prank(owner);
        uint256 id1 = nft.mint(alice, "ipfs://nft/1");
        assertEq(id1, 1, unicode"首个 tokenId 应为 1");
        assertEq(nft.ownerOf(1), alice);
        assertEq(nft.balanceOf(alice), 1);
        assertEq(nft.tokenURI(1), "ipfs://nft/1");

        // 第二个 id 自增
        vm.prank(owner);
        uint256 id2 = nft.mint(bob, "ipfs://nft/2");
        assertEq(id2, 2, unicode"tokenId 应从 1 自增");
        assertEq(nft.ownerOf(2), bob);
    }

    function test_mint_emits_MintNftToken() public {
        vm.expectEmit(true, true, true, true, address(nft));
        emit MetaNFT.MintNftToken(alice, 1, "ipfs://nft/1");
        vm.prank(owner);
        nft.mint(alice, "ipfs://nft/1");
    }

    function test_mint_nonOwner_reverts() public {
        vm.expectRevert(
            abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", alice)
        );
        vm.prank(alice);
        nft.mint(bob, "ipfs://nft/1");
    }

    function test_tokenURI_nonexistent_reverts() public {
        vm.expectRevert(
            abi.encodeWithSignature("ERC721NonexistentToken(uint256)", 999)
        );
        nft.tokenURI(999);
    }

    function test_transfer_direct() public {
        vm.prank(owner);
        nft.mint(alice, "ipfs://nft/1");
        vm.prank(alice);
        nft.transferFrom(alice, bob, 1);
        assertEq(nft.ownerOf(1), bob);
    }

    function test_transfer_via_approve() public {
        vm.prank(owner);
        nft.mint(alice, "ipfs://nft/1");
        vm.prank(alice);
        nft.approve(bob, 1);
        assertEq(nft.getApproved(1), bob);
        vm.prank(bob);
        nft.transferFrom(alice, bob, 1);
        assertEq(nft.ownerOf(1), bob);
    }

    function test_transfer_via_setApprovalForAll() public {
        vm.prank(owner);
        nft.mint(alice, "ipfs://nft/1");
        vm.prank(alice);
        nft.setApprovalForAll(bob, true);
        assertEq(nft.isApprovedForAll(alice, bob), true);
        vm.prank(bob);
        nft.transferFrom(alice, bob, 1);
        assertEq(nft.ownerOf(1), bob);
    }

    function test_transfer_unapproved_reverts() public {
        vm.prank(owner);
        nft.mint(alice, "ipfs://nft/1");
        vm.expectRevert(
            abi.encodeWithSignature(
                "ERC721InsufficientApproval(address,uint256)",
                bob,
                1
            )
        );
        vm.prank(bob);
        nft.transferFrom(alice, bob, 1);
    }

    function test_burn() public {
        vm.prank(owner);
        nft.mint(alice, "ipfs://nft/1");
        vm.prank(alice);
        nft.burn(1);
        // 销毁后 ownerOf / tokenURI 均应 revert
        vm.expectRevert(
            abi.encodeWithSignature("ERC721NonexistentToken(uint256)", 1)
        );
        nft.ownerOf(1);
    }
}
