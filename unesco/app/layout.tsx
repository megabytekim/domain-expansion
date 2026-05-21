import type { Metadata } from "next";
import { Noto_Serif_KR, Noto_Sans_KR, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const serif = Noto_Serif_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  display: "swap",
  variable: "--font-serif",
});

const sans = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
  variable: "--font-sans",
});

const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "혜초여행 세계 투어 지도",
  description: "트레킹·문화·실크로드 해외 패키지 투어를 지도에서 탐색하세요. 인기 순위와 출발 일정을 한눈에.",
  openGraph: {
    title: "혜초여행 세계 투어 지도",
    description: "트레킹·문화·실크로드 해외 패키지 투어를 지도에서 탐색하세요. 인기 순위와 출발 일정을 한눈에.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${serif.variable} ${sans.variable} ${display.variable}`}>
      <body className="h-screen w-screen overflow-hidden font-sans">{children}</body>
    </html>
  );
}
