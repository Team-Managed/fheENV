import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { RootProvider } from "fumadocs-ui/provider/next";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ defaultTheme: "dark", enabled: false }}>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: (
            <span className="font-mono font-bold">
              <span className="text-teal-400">fhe</span>ENV
            </span>
          ),
          url: "/",
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
