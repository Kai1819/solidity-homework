/// <reference types="next" />
/// <reference types="next/image-types/global" />

import type { EthereumProvider } from "./index";

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export {};
