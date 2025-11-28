export default function QuickInputLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="overflow-hidden">{children}</body>
    </html>
  );
}
