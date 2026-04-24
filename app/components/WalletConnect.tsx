import dynamic from "next/dynamic";
import { useWallet } from "@solana/wallet-adapter-react";
import { shortenAddress } from "../utils/connection";

// SSR disabled — WalletMultiButton renders wallet icons that don't exist on the server
const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

export default function WalletConnect() {
  const { publicKey, connected } = useWallet();

  return (
    <div className="flex items-center gap-3">
      {connected && publicKey && (
        <span className="text-xs text-white/50 hidden sm:block">
          {shortenAddress(publicKey.toBase58())}
        </span>
      )}
      <WalletMultiButton
        style={{
          backgroundColor: connected ? "rgba(255,255,255,0.08)" : "#C9A84C",
          color: connected ? "#ffffff" : "#0A0E1A",
          borderRadius: "6px",
          fontSize: "12px",
          fontWeight: 600,
          height: "36px",
          fontFamily: "Space Grotesk, sans-serif",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      />
    </div>
  );
}
