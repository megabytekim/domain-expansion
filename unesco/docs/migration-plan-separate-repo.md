# unesco를 별도 git repo로 분리 — 마이그레이션 플랜

작성: 2026-05-26

## 결론 (TL;DR)

**`unesco-delta.vercel.app` URL은 그대로 유지하면서 분리 가능.**
권장 경로: **시나리오 A (Vercel 프로젝트의 git source만 변경)** + `git subtree split`으로 history 보존.

작업 시간 ~30분. 위험도 낮음 (옛 프로젝트 그대로 있어 rollback 쉬움).

---

## 1. Vercel URL 모델

```
[Vercel 계정] team_VuiqYkZq...
   └─ [Project] prj_hQsE4u... = "unesco"
        ├─ Git connection         → github.com/megabytekim/domain-expansion (현재)
        ├─ Root Directory         → "unesco" (모노레포 옵션)
        ├─ Environment variables  → NEXT_PUBLIC_MAPTILER_KEY 등
        ├─ Aliases                → unesco-delta.vercel.app 등
        └─ Deployments            → unesco-jcnau4se7-... (이력)
```

핵심: **alias는 Vercel 프로젝트에 묶임**. Git repo는 프로젝트 내부 설정 한 항목.
→ Git repo만 새 repo로 갈아끼우면 alias 그대로.

---

## 2. 사전 확인 사항 (이미 검증됨)

- [x] unesco/ 디렉토리가 **자급자족** — domain-expansion의 다른 폴더 import 0
  - `grep -rE "from ['\"]\.\./\.\." unesco/{scripts,components,app}` 결과 비어있음
- [x] `vercel.json` 없음 — Vercel 설정은 모두 Web UI에 있음
- [x] `.vercel/project.json` 존재 — projectId `prj_hQsE4ugnnlRWj7PWjbZLBx19pezw`
- [x] `.github/workflows/crawl.yml`은 모노레포 root에 있음 (현재 미사용 — systemd로 대체)

---

## 3. 시나리오 비교

| 시나리오 | URL | History | 작업량 | 권장 |
|---|---|---|---|---|
| **A. Vercel git source만 변경** | 유지 ✓ | `git subtree split`으로 보존 가능 | 30분 | **★ 권장** |
| B. 새 Vercel 프로젝트 + alias 이전 | 유지 가능 (alias 옮김) | fresh start | 1-2h | clean start 원할 때 |
| C. 완전 새로 + 새 URL | 새 URL | fresh start | 1h | brand 새로고침 시 |

---

## 4. 시나리오 A 단계별 진행

### Phase 1 — 새 GitHub repo + history 보존

```bash
# 1. unesco/ 폴더만의 history를 별도 브랜치로 추출
cd /home/ubuntu/domain-expansion
git subtree split --prefix=unesco -b unesco-only
# → "unesco-only" 브랜치에 unesco/ 안의 commit history만 분리됨

# 2. 새 repo 디렉토리에 clone
cd /tmp
mkdir unesco-map && cd unesco-map
git init
git pull /home/ubuntu/domain-expansion unesco-only

# 3. 새 GitHub repo 만들기 (web 또는 gh)
gh repo create megabytekim/unesco-map --public --source=. --remote=origin
# 또는 web에서 만든 후:
git remote add origin git@github.com:megabytekim/unesco-map.git

git push -u origin main
```

**`git subtree split`의 동작**:
- prefix 지정한 폴더 안의 commit만 골라냄
- 그 안의 변경만 다룬 commit은 그대로 옮김
- 모노레포 root 변경 포함 cross-cutting commit은 unesco/ 부분만 남음

### Phase 2 — Vercel 프로젝트의 Git source 변경

Vercel Web UI:
1. https://vercel.com → unesco project
2. **Settings → Git**
3. **Disconnect** 현재 연결 (domain-expansion)
4. **Connect Git Repository → 새 repo (unesco-map) 선택**
   - GitHub App이 새 repo access 권한 요청하면 승인
5. **Settings → General → Root Directory**
   - 현재 `"unesco"`로 설정되어 있을 것 → **비우거나 `.`로 변경** (새 repo는 root에 코드)
6. **Redeploy** (Deployments 탭에서 Redeploy 버튼)
7. 새 build 성공 확인 + `unesco-delta.vercel.app` 정상 동작 확인

### Phase 3 — systemd 서비스 path 갱신

서버 (lightsail) 에서:

```bash
# 1. 새 repo clone
cd ~
git clone git@github.com:megabytekim/unesco-map.git
cd unesco-map
npm install

# 2. 환경 변수 확인 (~/.env 그대로 OK)

# 3. systemd service 수정
nano ~/.config/systemd/user/unesco-crawl.service
```

기존:
```ini
ExecStart=/bin/bash -c 'cd %h/domain-expansion && git checkout crawler-lightsail-llm && git pull --ff-only origin crawler-lightsail-llm && cd unesco && bash scripts/crawl.sh'
WorkingDirectory=%h/domain-expansion/unesco
```

→ 변경:
```ini
ExecStart=/bin/bash -c 'cd %h/unesco-map && git pull --ff-only origin main && bash scripts/crawl.sh'
WorkingDirectory=%h/unesco-map
```

```bash
# 4. systemd 재로드
systemctl --user daemon-reload
systemctl --user restart unesco-crawl.timer

# 5. 수동 한 번 실행 (dry-run 또는 limit 1)
systemctl --user start unesco-crawl.service
journalctl --user -u unesco-crawl.service -f
```

### Phase 4 — 부수 정리

```bash
# 1. CLAUDE.md, AGENTS.md 경로 갱신
# - "domain-expansion 모노레포의 unesco/ 서브디렉토리다" 같은 문구
# - "GitHub push는 ... 자동 배포 안 됨"은 그대로 OR 자동 deploy로 전환 (옵션)

# 2. .vercel/ 디렉토리를 .gitignore 확인 (이미 되어있음)

# 3. 옛 모노레포의 unesco/ 폴더 삭제 (또는 archive)
cd /home/ubuntu/domain-expansion
git rm -rf unesco
git commit -m "chore: unesco 별도 repo로 분리됨 → github.com/megabytekim/unesco-map"
git push

# 4. GitHub Issue 라벨 다시 생성 (새 repo는 라벨 0)
PAT=$(grep GITHUB_PAT ~/.env | sed 's/.*=//')
curl -X POST -H "Authorization: token $PAT" \
  https://api.github.com/repos/megabytekim/unesco-map/labels \
  -d '{"name":"crawler","color":"0E8A16"}'
```

### Phase 5 — 검증

```bash
# 1. 새 repo로 deploy 트리거
cd ~/unesco-map
vercel --prod --token=$(cat ~/.vercel-token)

# 2. alias 가리키는 deployment 확인
npx vercel inspect unesco-delta.vercel.app --token=$(cat ~/.vercel-token)
# → 새 build의 deployment URL이어야

# 3. 사이트 동작 확인
curl -s https://unesco-delta.vercel.app/build-id.txt
# (새 build id)

# 4. 다음 일요일 19:00 UTC 시점 timer 발화 확인
systemctl --user list-timers unesco-crawl.timer
```

---

## 5. 자주 빠뜨리는 함정

| 함정 | 대처 |
|---|---|
| `.vercel/`이 commit됨 | `.gitignore`에 `.vercel/` 추가 |
| Vercel **Root Directory** 옛 설정 (`"unesco"`) 유지 | Web UI에서 `.`로 변경 |
| Build cache miss로 첫 build 느림 | 정상 — 한 번만 |
| GitHub App access 권한 | Connect 시 새 repo prompt에 승인 |
| systemd Working Directory 옛 경로 | 위 Phase 3에서 수정 |
| GitHub Issue/라벨 | 새 repo에 새로 — `crawler` 라벨 + 옛 #1 issue 이전 또는 새로 |
| cross-cutting commit (모노레포 root + unesco 동시 수정) | unesco/ 부분만 보존됨 — 우리 케이스엔 거의 없음 |
| 자동 deploy on push (모노레포 시절 비활성) | 별도 repo는 root build 가능 → Vercel UI에서 자동 deploy 다시 활성화 고려 |

---

## 6. 향후 옵션 — 자동 deploy로 전환

별도 repo는 root에 build 파일이 있으니 **GitHub push → Vercel 자동 deploy** 가능.

이렇게 하면:
- `vercel --prod` 수동 명령 불필요
- main 브랜치 push만으로 production 반영
- systemd timer는 그대로 (서버에서 데이터 갱신 후 git push만 하면 Vercel가 알아서)

systemd service의 마지막 단계 (지금 `vercel --prod`)을 `git push` 한 줄로 줄일 수 있음 → 단순화.

---

## 7. Rollback 절차 (시나리오 A 후)

만약 분리 후 문제 발견:

1. Vercel Web UI → Settings → Git → Disconnect → Reconnect to domain-expansion
2. Root Directory → "unesco"로 다시 설정
3. 옛 deployment를 alias로 복원: `vercel alias <옛 deployment URL> unesco-delta.vercel.app`
4. systemd service path 옛 경로로 되돌림

옛 프로젝트가 그대로 있어서 rollback이 안전. 그래서 시나리오 A를 권장.

---

## 8. 진행 결정

- [ ] **A로 즉시 진행**
- [ ] **B (clean start)로 진행** — history 가벼움 우선
- [ ] **나중에** — 지금은 모노레포 유지, 필요 시 이 문서 참고
