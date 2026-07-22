"use client";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "fumadocs-ui/provider/base";

export function Mermaid({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState("");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  useEffect(() => {
    let cancelled = false;
    setSvg("");
    import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        theme: "base",
        themeVariables: isDark
          ? {
              background: "#021526",
              primaryColor: "#03346e",
              primaryTextColor: "#f8fafc",
              primaryBorderColor: "#6eacda",
              lineColor: "#6eacda",
              secondaryColor: "#06294a",
              tertiaryColor: "#0b355d",
              clusterBkg: "#021526",
              clusterBorder: "#6eacda",
              edgeLabelBackground: "#021526",
              titleColor: "#e2e2b6",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            }
          : {
              background: "#f4f8fc",
              primaryColor: "#d9ebf8",
              primaryTextColor: "#021526",
              primaryBorderColor: "#337bb5",
              lineColor: "#337bb5",
              secondaryColor: "#e8f2fa",
              tertiaryColor: "#f7fbfe",
              clusterBkg: "#f4f8fc",
              clusterBorder: "#6eacda",
              edgeLabelBackground: "#f4f8fc",
              titleColor: "#03346e",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            },
      });
      const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
      m.default.render(id, chart).then(({ svg: rendered }) => {
        if (!cancelled) setSvg(rendered);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [chart, isDark]);

  const surfaceClass = isDark
    ? "border-brand-blue/20 bg-brand-ink text-slate-100"
    : "border-brand-navy/20 bg-[#f4f8fc] text-brand-ink";

  if (!svg) {
    return (
      <div className={`rounded-xl border p-8 text-center text-sm ${surfaceClass}`}>
        Loading diagram...
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={`overflow-x-auto rounded-xl border p-6 [&_svg]:mx-auto [&_svg]:max-w-full ${surfaceClass}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
