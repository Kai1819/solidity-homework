// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Normal{
    // ### 2. :white_check_mark: 反转字符串 (Reverse String)
    // - 题目描述：反转一个字符串。输入 "abcde"，输出 "edcba"
    // 倒序遍历+正序填值
    function reverse(string memory str) public pure returns(string memory){
        bytes memory b = bytes(str);
        uint len = b.length;
        if (len == 0) return str;

        bytes memory r = new bytes(len);
        uint256 index = 0;
        for(uint256 i = len ; i > 0; i--){
            r[index] = b[i-1];
            index ++;
        }
        return string(r);
    }
    // 正序遍历+倒序填值
    // function reverse(string memory str) public pure returns (string memory) {
    //     bytes memory b = bytes(str);
    //     uint len = b.length;

    //     if (len == 0) return str;

    //     bytes memory r = new bytes(len);
    //     for (uint256 i = 0; i < len; i++) {
    //         r[len - 1 - i] = b[i];
    //     }
    //     return string(r);
    // }

    // ### 3. :white_check_mark:  用 solidity 实现整数转罗马数字
    // - 题目描述在 https://leetcode.cn/problems/roman-to-integer/description/3.
    // "MCMXCIV" 1994
    function romanToInt(string memory s) public pure returns (uint256) {
        bytes memory b = bytes(s);
        uint256 total = 0;
        uint256 n = b.length;

        for (uint256 i = 0; i < n; i++) {
            uint256 v = valueOf(b[i]);
            // 如果当前字符值 < 下一个字符值，说明是"小在左"的减法情况
            if (i + 1 < n && v < valueOf(b[i + 1])) {
                total -= v;
            } else {
                total += v;
            }
        }
        return total;
    }
    // 单个罗马字符转为int数字
    function valueOf(bytes1 c) internal pure returns (uint256) {
        if (c == 'I') return 1;
        if (c == 'V') return 5;
        if (c == 'X') return 10;
        if (c == 'L') return 50;
        if (c == 'C') return 100;
        if (c == 'D') return 500;
        if (c == 'M') return 1000;
        revert("invalid roman character");
    }


    // ### 4. :white_check_mark:  用 solidity 实现罗马数字转数整数
    // - 题目描述在 https://leetcode.cn/problems/integer-to-roman/description/
    // 1994 "MCMXCIV"
    function intToRoman(uint256 num) public pure returns (string memory) {
        uint256[13] memory values = [
            uint256(1000), 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1
        ];
        bytes[] memory symbols = new bytes[](13);
        symbols[0]  = bytes("M");
        symbols[1]  = bytes("CM");
        symbols[2]  = bytes("D");
        symbols[3]  = bytes("CD");
        symbols[4]  = bytes("C");
        symbols[5]  = bytes("XC");
        symbols[6]  = bytes("L");
        symbols[7]  = bytes("XL");
        symbols[8]  = bytes("X");
        symbols[9]  = bytes("IX");
        symbols[10] = bytes("V");
        symbols[11] = bytes("IV");
        symbols[12] = bytes("I");

        // 第一遍：计算总长度，便于一次性分配内存
        uint256 totalLen = 0;
        uint256 remaining = num;
        for (uint256 i = 0; i < 13; i++) {
            while (remaining >= values[i]) {
                totalLen += symbols[i].length;
                remaining -= values[i];
            }
        }

        // 第二遍：填充
        bytes memory result = new bytes(totalLen);
        uint256 pos = 0;
        remaining = num;
        for (uint256 i = 0; i < 13; i++) {
            while (remaining >= values[i]) {
                bytes memory sym = symbols[i];
                for (uint256 j = 0; j < sym.length; j++) {
                    result[pos++] = sym[j];
                }
                remaining -= values[i];
            }
        }
        return string(result);
    }

    // ### 5. :white_check_mark:  合并两个有序数组 (Merge Sorted Array)
    // - 题目描述：将两个有序数组合并为一个有序数组。
    // 两个升序数组合并 [3,7,8] [2,6,9]
    function mergeSorted(
        uint256[] memory a,
        uint256[] memory b
    ) public pure returns (uint256[] memory result) {
        uint256 lenA = a.length;
        uint256 lenB = b.length;
        result = new uint256[](lenA + lenB);

        uint256 i = 0; // a 的索引
        uint256 j = 0; // b 的索引
        uint256 k = 0; // result 的索引

        // 1) 双指针取较小值
        while (i < lenA && j < lenB) {
            if (a[i] <= b[j]) {
                result[k++] = a[i++];
            } else {
                result[k++] = b[j++];
            }
        }

        // 2) 收尾：把 a 中剩余元素拷完
        while (i < lenA) {
            result[k++] = a[i++];
        }
        // 3) 收尾：把 b 中剩余元素拷完
        while (j < lenB) {
            result[k++] = b[j++];
        }
    }

    // ### 6. :white_check_mark:  二分查找 (Binary Search)
    // - 题目描述：在一个有序数组中查找目标值。
    // [0,2,6,8,9]
    function indexOf(
        uint256[] memory arr,
        uint256 target
    ) public pure returns (bool found, uint256 index) {
        uint256 left = 0;
        uint256 right = arr.length; // 半开区间：right 这个位置"不含"在搜索范围内

        while (left < right) {
            // 关键：不要写成 (left + right) / 2，left+right 可能溢出 uint256
            uint256 mid = left + (right - left) / 2;

            if (arr[mid] == target) {
                return (true, mid);
            } else if (arr[mid] < target) {
                left = mid + 1; // 目标在右半
            } else {
                right = mid;     // 目标在左半（right 不含 mid 本身）
            }
        }
        return (false, 0); // 遍历完没找到
    }
}