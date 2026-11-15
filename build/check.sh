#!/bin/bash
# Checks that need no build: every script parses, the generated recipes are what their
# generator makes, and every source a recipe names is pinned in sources.list.
#   build/check.sh
set -euo pipefail
cd "$(dirname "$0")/.."
bad=0

for f in build/*.sh recipes/*/*.sh recipes/common/*.inc desk/system/solinux-desk desk/system/profile.sh desk/system/chainboot-start solana/cargo-sbf; do
  bash -n "$f" || { echo "does not parse: $f"; bad=1; }
done
python3 -B -m py_compile build/*.py || bad=1

# every archive a recipe is built from has its hash in sources.list
# (a line is "<sha256> <address>", or "<sha256> <address>#<name>" when the file is saved under another name)
pinned=$(grep -v '^#' sources.list | awk 'NF >= 2 { if (split($2, h, "#") == 2) print h[2]; else { n = split($2, p, "/"); print p[n] } }' | sort -u)
for recipe in recipes/*/*.sh; do
  for src in $(sed -n 's/^pkg=.* src=\(.*\)$/\1/p' "$recipe" | head -n1); do
    grep -qxF "$src" <<<"$pinned" || { echo "not pinned in sources.list: $src ($recipe)"; bad=1; }
  done
done

# the recipes that a script writes are in step with that script
before=$(cat recipes/desktop/*.sh recipes/apps/*.sh | sha256sum)
python3 -B build/make-desktop-recipes.py > /dev/null
[ "$before" = "$(cat recipes/desktop/*.sh recipes/apps/*.sh | sha256sum)" ] || { echo "recipes/desktop or recipes/apps differ from what build/make-desktop-recipes.py writes"; bad=1; }

[ "$bad" = 0 ] && echo "all checks passed"
exit "$bad"
