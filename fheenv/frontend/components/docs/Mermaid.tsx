"use client";
import { useEffect, useRef, useState } from "react";

export function Mermaid({ chart }: { chart: string }) {
    const ref = useRef<HTMLDivElement>(null);
    const [svg, setSvg] = useState("");

    useEffect(() => {
        let cancelled = false;
        import("mermaid").then((m) => {
            m.default.initialize({
                startOnLoad: false,
                theme: "dark",
                themeVariables: {
                    primaryColor: "#1e293b",
                    primaryTextColor: "#f1f5f9",
                    primaryBorderColor: "#2dd4bf",
                    lineColor: "#2dd4bf",
                    secondaryColor: "#0f172a",
                    tertiaryColor: "#1e293b",
                    fontFamily: "monospace",
                    fontSize: "14px",
                },
            });
            const id = `mermaid-${Math.random().toString(36).slice(2, 9)}`;
            m.default.render(id, chart).then(({ svg: rendered }) => {
                if (!cancelled) setSvg(rendered);
            });
        });
        return () => { cancelled = true; };
    }, [chart]);

    if (!svg) {
        return (
            <div className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-8 text-center text-sm text-slate-500">
                Loading diagram...
            </div>
        );
    }

    return (
        <div
            ref={ref}
            className="rounded-xl border border-white/[0.06] bg-[#0d1117] p-6 overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    );
}
