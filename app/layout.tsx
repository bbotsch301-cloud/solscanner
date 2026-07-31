import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Global Goshens — The Gathering",
  description:
    "A curated menagerie of tokens across Solana, Ethereum, and BNB Chain — gathered together to operate in unity.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-neutral-950 text-neutral-100">
        <header className="border-b border-neutral-800/80">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-black tracking-tight text-amber-300">Global Goshens</span>
            </Link>
            <nav className="flex items-center gap-5 text-sm font-semibold text-neutral-300">
              <Link href="/" className="hover:text-amber-300">
                Tokens
              </Link>
              <Link href="/liquidity" className="hover:text-amber-300">
                Liquidity
              </Link>
            </nav>
          </div>
        </header>

        <div className="flex-1">{children}</div>

        <footer className="border-t border-neutral-800/80">
          <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-neutral-500">
            Gathering the body together to operate in unity. Prices via DexScreener; not
            financial advice.
          </div>
        </footer>
      </body>
    </html>
  );
}
