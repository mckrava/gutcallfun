import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/state/AppProvider";
import { AppFrame } from "@/components/shell/AppFrame";

export const metadata: Metadata = {
  title: "GutCall — live football, predict for fun",
  description:
    "Read every live moment, duel your squad in real time, climb the ranks.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#04060b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <AppFrame>{children}</AppFrame>
        </AppProvider>
      </body>
    </html>
  );
}
