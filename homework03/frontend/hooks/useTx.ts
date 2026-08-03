"use client";

import { useState, useCallback } from "react";
import { useAlert } from "@/components/AlertProvider";
import { toErrorMessage } from "@/lib/format";

interface RunOptions<T> {
  successMsg?: string;
  onSuccess?: (result: T) => void | Promise<void>;
  /** 失败时不弹错误框（由调用方处理） */
  silent?: boolean;
}

/**
 * 统一交易封装：try/catch/finally + 错误映射 + 成功提示
 */
export function useTx() {
  const { showSuccess, showError } = useAlert();
  const [sending, setSending] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, options: RunOptions<T> = {}): Promise<T | undefined> => {
      setSending(true);
      try {
        const result = await fn();
        if (options.successMsg) showSuccess(options.successMsg);
        if (options.onSuccess) await options.onSuccess(result);
        return result;
      } catch (e) {
        if (!options.silent) showError(toErrorMessage(e), "操作失败");
        return undefined;
      } finally {
        setSending(false);
      }
    },
    [showSuccess, showError],
  );

  return { run, sending };
}
