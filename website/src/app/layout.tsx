import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgentID - Cryptographic Identity for AI Agents",
  description: "Register, fingerprint and verify AI agents on-chain. No platform trust required.",
  keywords: ["AI", "agents", "blockchain", "identity", "verification", "cryptographic", "Base"],
  authors: [{ name: "AgentID" }],
  openGraph: {
    title: "AgentID - Cryptographic Identity for AI Agents",
    description: "Register, fingerprint and verify AI agents on-chain. No platform trust required.",
    url: "https://agentid.xyz",
    siteName: "AgentID",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AgentID - Cryptographic Identity for AI Agents",
    description: "Register, fingerprint and verify AI agents on-chain. No platform trust required.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${ibmPlexMono.className} antialiased bg-[#0a0a0a] text-[#e5e5e5] min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
