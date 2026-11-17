#!/usr/bin/env bash
# Merge the latest upstream T3 Code into this fork's main, then typecheck mobile.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"
export PATH="$PWD/node_modules/.bin:$PATH"

if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or stash your changes first." >&2
  exit 1
fi

git remote get-url upstream >/dev/null 2>&1 ||
  git remote add upstream https://github.com/pingdotgg/t3code.git

git checkout main
git fetch upstream --no-tags
behind=$(git rev-list --count main..upstream/main)
if [ "$behind" -eq 0 ]; then
  echo "Already up to date with upstream."
  exit 0
fi
echo "Merging $behind upstream commits."

if ! git merge --no-edit upstream/main; then
  echo
  echo "Conflicts to resolve (keep Theo's change, then re-apply the fork seam):"
  git diff --name-only --diff-filter=U
  echo
  echo "Fork seams live where these files import from src/fork/:"
  git grep -l "fork/agents" -- apps || true
  echo "After resolving: git add <files> && git commit, then rerun this script."
  exit 1
fi

pnpm install --frozen-lockfile
(cd apps/mobile && vp run typecheck)
echo
echo "Merged and typechecked. Push with: git push origin main"
