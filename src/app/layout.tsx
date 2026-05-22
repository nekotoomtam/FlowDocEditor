import type { Metadata } from "next";
import { listFontFaceEntries } from "@/font-registry";

export const metadata: Metadata = {
  title: "FlowDoc",
  description: "FlowDoc development environment",
};

function buildFontFaceCss(): string {
  return listFontFaceEntries()
    .flatMap((entry) => Object.values(entry.variants).map((variant) => `
          @font-face {
            font-family: "${entry.cssFamily}";
            src: url("/fonts/${variant.fileName}") format("truetype");
            font-weight: ${variant.fontWeight};
            font-style: ${variant.fontStyle};
            font-display: swap;
          }
        `))
    .join("\n");
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <style>{buildFontFaceCss()}</style>
        {children}
      </body>
    </html>
  );
}
