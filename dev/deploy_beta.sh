#!/usr/bin/env bash
# Publish the playtest build to GitHub Pages (branch `gh-pages`).
#
#   ./dev/deploy_beta.sh              # build + push + wait for Pages
#   ./dev/deploy_beta.sh --dry-run    # only build .beta-site/, no push
#
# The beta is a *runtime* copy: no dev/, no dist/, no store/, no source
# references. The recorder (playtest/) ships only here, never in the release zip.
# `main` is never touched — this pushes an orphan branch.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

REPO="foxmuldery/ji-she-in-frame"
BRANCH="gh-pages"
SITE=".beta-site"
VER="$(tr -d '[:space:]' < VERSION)"
STAMP="$(date '+%Y-%m-%d %H:%M')"
DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

echo "== beta build v${VER} =="

# ---- 1. stage ------------------------------------------------------------
mkdir -p "$SITE"
find "$SITE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +

cp index.html style.css game.js VERSION "$SITE/"
cp -R assets "$SITE/assets"
cp -R vendor "$SITE/vendor" 2>/dev/null || mkdir -p "$SITE/vendor"
mkdir -p "$SITE/playtest"
cp playtest/recorder.js playtest/recorder.css playtest/report.html playtest/beta.html "$SITE/playtest/"
cp assets/CREDITS.md "$SITE/CREDITS.md" 2>/dev/null || true

cat > "$SITE/robots.txt" <<'EOF'
User-agent: *
Disallow: /
EOF
: > "$SITE/.nojekyll"

cat > "$SITE/BETA.md" <<EOF
# 内测构建 v${VER}

- 构建时间：${STAMP}
- 入口：\`/playtest/beta.html\`（需要试玩密码；密码不在本仓库）
- 游戏：\`/index.html\`，带记录器时 \`/index.html?rec=1\`
- 复盘：\`/playtest/report.html\`
- 内容：运行时文件 + 内测记录器；不含开发工具与生成源。
- 本构建不是发行包；发行包见仓库 \`dist/\`（本地生成）。
EOF

# the recorder is a beta-only tool; never ship a stray test dump
rm -f "$SITE/playtest/_"*.json "$SITE/playtest/"*.map
find "$SITE" -name '.DS_Store' -delete

# ---- 1b. encrypt the playtest payload ------------------------------------
# The site is public (GitHub Pages), so the game code and the two tools ship as
# AES-256-GCM ciphertext and only decrypt in a browser tab that has been given
# the playtest password. dev/.beta_pass is gitignored; BETA_PASS overrides it.
echo "== sealing playtest payload =="
node dev/beta_gate/build_gate.mjs "$SITE"

FILES=$(find "$SITE" -type f ! -path "*/.git/*" | wc -l | tr -d ' ')
SIZE=$(du -sh "$SITE" | cut -f1)
echo "   staged ${FILES} files, ${SIZE}"

if [[ $DRY -eq 1 ]]; then
  echo "   dry run — ${SITE}/ is ready, nothing pushed"
  exit 0
fi

# ---- 2. commit on gh-pages ----------------------------------------------
if [[ ! -d "$SITE/.git" ]]; then
  git init -q "$SITE"
  git -C "$SITE" remote add origin "https://github.com/${REPO}.git"
  echo "   initialised ${SITE}/.git"
fi
if git -C "$SITE" remote get-url origin >/dev/null 2>&1; then
  git -C "$SITE" remote set-url origin "https://github.com/${REPO}.git"
else
  git -C "$SITE" remote add origin "https://github.com/${REPO}.git"
fi

git -C "$SITE" fetch -q origin "$BRANCH" 2>/dev/null || true
if git -C "$SITE" rev-parse --verify FETCH_HEAD >/dev/null 2>&1; then
  git -C "$SITE" checkout -q -B "$BRANCH" FETCH_HEAD
else
  git -C "$SITE" checkout -q -B "$BRANCH" 2>/dev/null || true
fi

git -C "$SITE" add -A
if git -C "$SITE" diff --cached --quiet; then
  echo "   no changes since last deploy"
else
  git -C "$SITE" -c user.name="ji build" -c user.email="build@local" \
    commit -q -m "beta: v${VER} playtest (${STAMP})"
  echo "   committed $(git -C "$SITE" rev-parse --short HEAD)"
fi

echo "== pushing ${BRANCH} =="
gh auth setup-git >/dev/null 2>&1 || true
git -C "$SITE" push -q origin "HEAD:${BRANCH}"
echo "   pushed"

# ---- 3. Pages ------------------------------------------------------------
echo "== github pages =="
if ! gh api "repos/${REPO}/pages" >/dev/null 2>&1; then
  gh api --method POST "repos/${REPO}/pages" \
    -f "source[branch]=${BRANCH}" -f "source[path]=/" >/dev/null \
    && echo "   pages enabled (${BRANCH})" || echo "   WARN: could not enable pages via API"
else
  echo "   pages already enabled"
fi

URL="https://$(echo "${REPO%%/*}" | tr '[:upper:]' '[:lower:]').github.io/${REPO##*/}"
for i in $(seq 1 20); do
  STATUS=$(gh api "repos/${REPO}/pages" --jq '.status // "unknown"' 2>/dev/null || echo unknown)
  [[ "$STATUS" == "built" ]] && break
  sleep 4
done

echo
echo "  内测入口： ${URL}/playtest/beta.html  （需要试玩密码）"
echo "  直接试玩： ${URL}/index.html?rec=1"
echo "  复盘页：   ${URL}/playtest/report.html"
echo "  Pages 状态：${STATUS:-unknown}"
