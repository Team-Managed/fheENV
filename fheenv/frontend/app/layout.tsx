import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "fheENV — Zero-Trust Secrets Management",
  description: "Your .env, encrypted. Not even us.",
  icons: {
    icon: "/brand/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn(spaceGrotesk.variable, jetbrainsMono.variable, "dark")}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[#030712] text-slate-100 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
