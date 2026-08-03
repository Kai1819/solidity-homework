import type { Metadata } from "next";
import "./globals.css";
import { Web3Provider } from "@/components/Web3Provider";
import { AlertProvider } from "@/components/AlertProvider";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "MetaNFT Auction - NFT 拍卖平台",
  description: "基于 Sepolia 测试网的 NFT 拍卖平台（MetaNFTAuction）",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/40 to-indigo-50/30">
        <Web3Provider>
          <AlertProvider>
            <Header />
            <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
          </AlertProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
