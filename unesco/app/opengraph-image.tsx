import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import path from "path";

export const dynamic = "force-static";
export const alt = "혜초여행 세계 투어 지도";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const fontData = readFileSync(
    path.join(process.cwd(), "public", "NotoSansKR-Bold.woff")
  );

  return new ImageResponse(
    (
      <div
        style={{
          background: "#0f172a",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Noto Sans KR'",
        }}
      >
        <div style={{ fontSize: 110, lineHeight: 1 }}>🧘</div>
        <div
          style={{
            color: "#f1f5f9",
            fontSize: 52,
            fontWeight: "bold",
            marginTop: 28,
            letterSpacing: "-1px",
          }}
        >
          혜초여행 세계 투어 지도
        </div>
        <div
          style={{
            color: "#64748b",
            fontSize: 26,
            marginTop: 14,
          }}
        >
          트레킹 · 문화 · 실크로드 · 인기 순위
        </div>
        <div
          style={{
            color: "#10b981",
            fontSize: 20,
            marginTop: 32,
            border: "1px solid #064e3b",
            borderRadius: 8,
            padding: "6px 18px",
            background: "rgba(16,185,129,0.08)",
          }}
        >
          hyecho.vercel.app
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Noto Sans KR", data: fontData, style: "normal", weight: 700 }],
    }
  );
}
