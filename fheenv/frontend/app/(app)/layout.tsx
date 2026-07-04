export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-gray-950 text-white">
      {children}
    </div>
  );
}
