import type { Metadata, Viewport } from "next";
import { GAME_CONFIG } from "./game-config";
import "./globals.css";

export const metadata: Metadata = {
  title: "Monkey Bananas · 원숭이 바나나",
  description: "Leap through the jungle and collect five bananas in this private, browser-based movement game.",
  openGraph: {
    title: "Monkey Bananas · 원숭이 바나나",
    description: "Leap through the jungle and collect five bananas in this private, browser-based movement game.",
    images: [{ url: "/thumbnail.png", width: 1200, height: 630 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b281d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang={GAME_CONFIG.defaultLocale}>
      <body>{children}</body>
    </html>
  );
}
