import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FlowDoc",
  description: "FlowDoc development environment",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
