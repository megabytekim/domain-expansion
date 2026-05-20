@AGENTS.md

# GitHub 계정

이 프로젝트에서는 `megabytekim` 계정을 사용할 것. `gh auth switch --user megabytekim`으로 전환 후 작업.

# 개선 작업 흐름

production(`unesco-delta.vercel.app`)에 바로 반영하지 말 것. 다음 순서로 진행:

1. **로컬 dev 서버**: `npm run dev` (http://localhost:3000) 띄워서 작업
2. **Playwright 자체 검토**: 변경 영향 받는 화면을 직접 열어 확인
   - 데스크탑(1440×900) + 모바일(390×844) 두 뷰포트
   - 콘솔 에러 (`browser_console_messages level=error`)
   - 골든 패스 + 회귀 가능성 있는 인접 기능
3. **문제 없을 때만 배포**: `vercel --prod`
4. 사용자에게 명시적 확인 없이는 production 배포 금지. dev 단계에서 결과 보고 → 사용자 OK → 배포.

검토에서 에러/회귀가 발견되면 배포 보류하고 사용자에게 보고.
