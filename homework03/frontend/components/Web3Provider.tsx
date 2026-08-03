"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { ethers } from "ethers";
import { getChainId, getRpcUrl } from "@/lib/config";
import { SEPOLIA_CHAIN_ID_HEX } from "@/lib/constants";

interface Web3ContextType {
  provider: ethers.BrowserProvider | null;
  signer: ethers.JsonRpcSigner | null;
  account: string | null;
  connectWallet: () => Promise<void>;
  disconnect: () => void;
  isConnecting: boolean;
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined);

export function Web3Provider({ children }: { children: ReactNode }) {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const chainId = getChainId();

  const switchToTargetChain = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
      });
    } catch (switchError: any) {
      // 4902: chain not added to wallet
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: SEPOLIA_CHAIN_ID_HEX,
                chainName: "Sepolia",
                nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                rpcUrls: [getRpcUrl() || "https://ethereum-sepolia.publicnode.com"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } catch (addError) {
          console.error("Error adding Sepolia network:", addError);
          throw addError;
        }
      } else {
        throw switchError;
      }
    }
  };

  const refreshSigner = async (addr: string) => {
    if (!window.ethereum) return;
    const currentProvider = new ethers.BrowserProvider(window.ethereum);
    const newSigner = await currentProvider.getSigner();
    setProvider(currentProvider);
    setSigner(newSigner);
    setAccount(addr);
  };

  const handleAccountsChanged = async (...args: unknown[]) => {
    const accounts = (args[0] as string[]) || [];
    if (accounts.length === 0) {
      setAccount(null);
      setSigner(null);
    } else {
      await refreshSigner(accounts[0]);
    }
  };

  const handleChainChanged = async () => {
    if (!window.ethereum) return;
    const newProvider = new ethers.BrowserProvider(window.ethereum);
    setProvider(newProvider);
    const accounts = (await window.ethereum.request({
      method: "eth_accounts",
    })) as string[];
    if (accounts.length > 0) {
      const newSigner = await newProvider.getSigner();
      setSigner(newSigner);
      setAccount(accounts[0]);
    } else {
      setAccount(null);
      setSigner(null);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      const initProvider = new ethers.BrowserProvider(window.ethereum);

      initProvider.getNetwork().then(async (network) => {
        if (Number(network.chainId) !== chainId) {
          try {
            await switchToTargetChain();
            if (!window.ethereum) return;
            const newProvider = new ethers.BrowserProvider(window.ethereum);
            setProvider(newProvider);
            const accounts = (await window.ethereum.request({
              method: "eth_accounts",
            })) as string[];
            if (accounts.length > 0) {
              const newSigner = await newProvider.getSigner();
              setSigner(newSigner);
              setAccount(accounts[0]);
            }
            return;
          } catch (error) {
            console.error("Failed to switch network:", error);
          }
        }
        setProvider(initProvider);
        if (window.ethereum) {
          const accounts = (await window.ethereum.request({
            method: "eth_accounts",
          })) as string[];
          if (accounts.length > 0) {
            handleAccountsChanged(accounts);
          }
        }
      });

      if (window.ethereum.on) {
        window.ethereum.on("accountsChanged", handleAccountsChanged);
        window.ethereum.on("chainChanged", handleChainChanged);
      }
    }

    return () => {
      if (window.ethereum?.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectWallet = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("请安装 MetaMask 钱包!");
      return;
    }
    try {
      setIsConnecting(true);
      const newProvider = new ethers.BrowserProvider(window.ethereum);
      const network = await newProvider.getNetwork();
      if (Number(network.chainId) !== chainId) {
        await switchToTargetChain();
      }
      const accounts = (await newProvider.send("eth_requestAccounts", [])) as string[];
      const newSigner = await newProvider.getSigner();
      setProvider(newProvider);
      setSigner(newSigner);
      setAccount(accounts[0]);
    } catch (error: any) {
      console.error("Error connecting wallet:", error);
      alert(error?.message || "连接钱包失败");
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = () => {
    setAccount(null);
    setSigner(null);
  };

  return (
    <Web3Context.Provider
      value={{ provider, signer, account, connectWallet, disconnect, isConnecting }}
    >
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (context === undefined) {
    throw new Error("useWeb3 must be used within a Web3Provider");
  }
  return context;
}
