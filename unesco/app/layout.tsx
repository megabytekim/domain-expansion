import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNESCO World Heritage Sites Map",
  description: "Explore 1,199+ UNESCO World Heritage Sites on an interactive map. See available travel packages from Hyecho Travel.",
  openGraph: {
    title: "UNESCO World Heritage Sites Map",
    description: "Interactive map of UNESCO World Heritage Sites with travel packages",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden">{children}</body>
    </html>
  );
}
