"use client";

import { useEffect, useState } from "react";
import { getLocalAddresses } from "@/lib/config";
import type { SetupAddresses } from "@/types";

/**
 * 客户端组件挂载后从 localStorage 读取辅助合约地址。
 * SSR 时返回 null，避免 hydration mismatch。
 */
export function useLocalAuxAddresses(): SetupAddresses | null {
  const [addrs, setAddrs] = useState<SetupAddresses | null>(null);
  useEffect(() => {
    setAddrs(getLocalAddresses());
  }, []);
  return addrs;
}