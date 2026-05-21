#!/bin/bash
# Hyecho 크롤 orchestrator.
#
# 실행 순서: crawl → fetch-unesco → llm-extract → enrich → safety-net → validate-and-report → push → deploy.
#
# Flags:
#   --dry-run      push/deploy skip
#   --skip-llm     LLM extract step skip
#   --products N   처음 N개 패키지만 크롤 (디버깅용)
#
# Env (~/.env):
#   VERCEL_TOKEN, GITHUB_PAT (또는 GH_TOKEN), NEXT_PUBLIC_MAPTILER_KEY
#
# 운영: systemd timer가 호출. 로그는 ~/logs/unesco-crawl-YYYY-MM-DD_HHMMSS.log.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

if [[ -f "$HOME/.env" ]]; then
  set -a
  source "$HOME/.env"
  set +a
fi

DRY_RUN=false
SKIP_LLM=false
PRODUCT_LIMIT=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --skip-llm) SKIP_LLM=true; shift ;;
    --products) PRODUCT_LIMIT="$2"; shift 2 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

LOG_DIR="$HOME/logs"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/unesco-crawl-$(date +%Y-%m-%d_%H%M%S).log"
exec > >(tee -a "$LOG") 2>&1

echo "=== crawl.sh start $(date -Iseconds)  dry=$DRY_RUN skip_llm=$SKIP_LLM products=${PRODUCT_LIMIT:-all} ==="

git pull --ff-only origin main || echo "(git pull failed — continuing with current checkout)"
npm ci

echo ""
echo "--- 1/4 crawl-all-hyecho.ts ---"
if [[ -n "$PRODUCT_LIMIT" ]]; then
  npx tsx scripts/crawl-all-hyecho.ts --products "$PRODUCT_LIMIT"
else
  npx tsx scripts/crawl-all-hyecho.ts
fi

echo ""
echo "--- 2/4 fetch-unesco.ts ---"
npx tsx scripts/fetch-unesco.ts

if [[ "$SKIP_LLM" == "false" ]]; then
  echo ""
  echo "--- 3a/4 llm-extract.ts ---"
  npx tsx scripts/llm-extract.ts
else
  echo "--- 3a/4 LLM extract skipped (--skip-llm) ---"
fi

echo ""
echo "--- 3b/4 enrich-locations.ts ---"
npx tsx scripts/enrich-locations.ts

echo ""
echo "--- 4/4 safety net ---"
OLD=$(git show HEAD:unesco/data/hyecho-packages.json 2>/dev/null | jq 'length' 2>/dev/null || echo 0)
NEW=$(jq 'length' data/hyecho-packages.json)
EMPTY_LOC=$(jq '[.[] | select((.locations | length) == 0)] | length' data/hyecho-packages.json)

FAIL_REASON=""
if [[ "$NEW" -lt 30 ]]; then
  FAIL_REASON="absolute-floor: only $NEW packages"
elif [[ "$OLD" -gt 0 ]] && [[ "$NEW" -lt "$(( OLD * 50 / 100 ))" ]]; then
  FAIL_REASON="relative-drop: $NEW < 50% of $OLD"
elif [[ "$NEW" -gt 0 ]] && [[ "$(( EMPTY_LOC * 100 / NEW ))" -gt 50 ]]; then
  FAIL_REASON="extraction-failure: $EMPTY_LOC/$NEW packages have empty locations (>50%)"
fi

if [[ -n "$FAIL_REASON" ]]; then
  echo "FAIL: $FAIL_REASON — restoring data/hyecho-packages.json"
  git checkout -- data/hyecho-packages.json
  exit 2
fi

echo "safety net OK: NEW=$NEW (OLD=$OLD), empty_locations=$EMPTY_LOC"

echo ""
echo "--- validate-and-report.ts ---"
npx tsx scripts/validate-and-report.ts || true

rm -rf /tmp/crawl-bodies

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "=== DRY RUN — git push / vercel skipped ==="
  echo "=== crawl.sh end $(date -Iseconds) ==="
  exit 0
fi

echo ""
echo "--- git commit & push ---"
if ! git diff --quiet -- data/; then
  git config user.email "lightsail-bot@hyecho.local"
  git config user.name "lightsail-bot"
  git add data/
  git commit -m "chore: data refresh $(date +%Y-%m-%d)"
  git push origin main
else
  echo "(no data changes — skip commit)"
fi

echo ""
echo "--- vercel --prod ---"
if [[ -z "${VERCEL_TOKEN:-}" ]]; then
  echo "VERCEL_TOKEN not set — skipping deploy"
else
  npx vercel --prod --yes --token "$VERCEL_TOKEN"
fi

echo ""
echo "=== crawl.sh end $(date -Iseconds) ==="
