"use client";

import { useEffect } from "react";

/**
 * Tab visibility 시 build-id 체크 + 새 deploy면 자동 reload.
 * 사용자가 페이지를 열어두고 다른 탭에서 작업하다 돌아왔을 때, 옛 코드 보지 않도록.
 */
export default function AutoReload() {
  useEffect(() => {
    const myBuildId = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!myBuildId) return;

    const check = async () => {
      try {
        const res = await fetch(`/build-id.txt?_=${Date.now()}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const latest = (await res.text()).trim();
        if (latest && latest !== myBuildId) {
          window.location.reload();
        }
      } catch {
        /* network 에러 시 무시 */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);

    // 페이지 첫 로드 직후엔 체크 안 함 (방금 받은 코드)
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
