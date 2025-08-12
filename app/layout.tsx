import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Noto_Serif_JP } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoSerif = Noto_Serif_JP({
  variable: "--font-serif-jp",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "aidma-talk",
  description: "AI改善トーク生成システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} ${notoSerif.variable} antialiased bg-[#0b1020] text-white`}>        
        <header className="border-b border-white/10 bg-[#0b1020]/80 backdrop-blur">
          <nav className="container mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold text-3xl text-white tracking-wide">アイドマトークAI</Link>
            <div className="flex items-center gap-5 text-sm">
              <Link href="/ingest" className="font-bold text-xl text-white hover:text-white">ナレッジ登録</Link>
              <Link href="/logs" className="text-white/90 font-bold text-xl hover:text-white">ログ</Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
