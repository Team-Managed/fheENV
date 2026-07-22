import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import { RootProvider } from "fumadocs-ui/provider/next";

function GitHubIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 .297a12 12 0 0 0-3.794 23.388c.6.111.82-.26.82-.577v-2.234c-3.338.726-4.043-1.416-4.043-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.418-1.305.762-1.605-2.665-.303-5.467-1.334-5.467-5.932 0-1.31.47-2.38 1.236-3.22-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.48 11.48 0 0 1 6.01 0c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.118 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.807 5.626-5.48 5.922.43.37.814 1.096.814 2.21v3.274c0 .32.216.694.825.576A12.003 12.003 0 0 0 12 .297Z" />
    </svg>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider theme={{ defaultTheme: "dark", enableSystem: false }}>
      <DocsLayout
        tree={source.pageTree}
        containerProps={{ className: "text-fd-foreground" }}
        themeSwitch={{ className: "p-0" }}
        links={[
          {
            type: "icon",
            text: "GitHub",
            label: "Open fheENV on GitHub",
            url: "https://github.com/Team-Managed/fheENV",
            icon: <GitHubIcon />,
            external: true,
            on: "menu",
          },
        ]}
        nav={{
          title: (
            <span className="font-mono font-bold">
              <span className="text-brand-blue">fhe</span>ENV
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
