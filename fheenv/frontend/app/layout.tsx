import type { Metadata } from "next";
import { Outfit, Fira_Code } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const firaCode = Fira_Code({
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
      className={cn(outfit.variable, firaCode.variable, "dark")}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-brand-ink text-slate-100 font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
