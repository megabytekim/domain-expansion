import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body className="h-screen w-screen overflow-hidden">{children}</body>
    </html>
  );
}
