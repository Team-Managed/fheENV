export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-brand-ink font-sans text-slate-100 antialiased selection:bg-brand-blue selection:text-brand-ink">
      {children}
    </div>
  );
}
