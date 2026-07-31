import { WalletProvider } from "@/app/components/WalletProvider";
import { LiquidityPanel } from "@/app/components/LiquidityPanel";

export const metadata = {
  title: "XGO/SOL Liquidity — provide liquidity, earn trading fees",
  description:
    "Provide liquidity to the XGO/SOL pool and earn a share of trading fees. Includes an impermanent-loss disclosure.",
};

export default function LiquidityPage() {
  return (
    <WalletProvider>
      <LiquidityPanel />
    </WalletProvider>
  );
}
