import TopNav from "@/components/TopNav";

// Layout for the "app shell" pages (home, dashboard, login) that share the
// standard top navigation. The viewer lives outside this group so it can
// render its own slim, share-focused nav instead. URLs are unchanged —
// (shell) is a route group, which is stripped from the path.
export default function ShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <TopNav />
      {children}
    </>
  );
}
