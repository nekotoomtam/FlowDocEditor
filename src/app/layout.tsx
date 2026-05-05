import type { Metadata } from "next";
import { DEFAULT_FONT_CSS_FAMILY, resolveFontFileName } from "@/font-registry";

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
      <body>
        <style>{`
          @font-face {
            font-family: "${DEFAULT_FONT_CSS_FAMILY}";
            src: url("/fonts/${resolveFontFileName("default")}") format("truetype");
            font-display: swap;
          }
        `}</style>
        {children}
      </body>
    </html>
  );
}
