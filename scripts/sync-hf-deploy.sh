#!/usr/bin/env bash
# hf-deploy ブランチに futurePreparation を取り込み、HF Spaces 用に
# 常に除外するファイルを自動で解消する。
#
# hf-deploy は「Deploy: HF Spaces + Render dual deployment setup」で
# digestor/*, .env.example, phi-agent/doc/* を意図的に削除している。
# futurePreparation 側でこれらが更新されるたびに modify/delete で
# コンフリクトするが、判断は毎回同じ (削除側を採用) なので自動化する。
#
# 使い方:
#   scripts/sync-hf-deploy.sh          # マージしてビルド確認、push はしない
#   scripts/sync-hf-deploy.sh --push   # 確認後 hf remote と origin へ push
#
# 前提: 作業ツリーがクリーンであること (未commit差分があれば中断する)

set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# hf-deploy が意図的に削除しているパス (modify/delete コンフリクトの対象)
DELETED_PATHS=(
  "digestor/package-lock.json"
  "digestor/package.json"
  "digestor/src/digestor.ts"
  "digestor/src/profiler.ts"
  "digestor/src/server.ts"
  "docker_compose_sphere_v1/.env.example"
  "phi-agent/doc/FAST_PATH_DESIGN.md"
  "phi-agent/doc/議論メモ.txt"
)

if [[ -n "$(git status --porcelain)" ]]; then
  echo "作業ツリーに未commitの差分があります。stash するか commit してから実行してください。" >&2
  git status --short >&2
  exit 1
fi

ORIGINAL_BRANCH="$(git branch --show-current)"

echo "== hf-deploy へ切り替え =="
git checkout hf-deploy

echo "== futurePreparation をマージ =="
if git merge futurePreparation --no-edit; then
  echo "コンフリクトなし。"
else
  echo "== 既知の delete パスを解消 =="
  for p in "${DELETED_PATHS[@]}"; do
    if git status --porcelain -- "$p" | grep -q '^DU'; then
      git rm -q "$p"
      echo "  rm (deleted側採用): $p"
    fi
  done

  # 想定外のコンフリクトが残っていたら止める
  if git status --porcelain | grep -qE '^(DU|UD|AA|UU)'; then
    echo "想定していないコンフリクトが残っています。手動で解消してください:" >&2
    git status --short | grep -E '^(DU|UD|AA|UU)' >&2
    exit 1
  fi
  git commit --no-edit
fi

echo "== renalCore ビルド確認 =="
(cd docker_compose_sphere_v1/services/renalCore && npm run build)

echo "== periphery 型チェック =="
(cd docker_compose_sphere_v1/services/periphery && npx tsc --noEmit)

# renalCore の再ビルドで dist/ に改行コードだけの差分が乗ることがあるので戻す
git checkout -- docker_compose_sphere_v1/services/renalCore/dist/ 2>/dev/null || true

echo "== 完了 =="
git log --oneline -1

if [[ "${1:-}" == "--push" ]]; then
  echo "== push =="
  git push hf hf-deploy:main
  git push origin hf-deploy
else
  echo "確認後、必要なら以下で push してください:"
  echo "  git push hf hf-deploy:main"
  echo "  git push origin hf-deploy"
fi

git checkout "$ORIGINAL_BRANCH"
