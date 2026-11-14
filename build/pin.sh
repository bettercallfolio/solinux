#!/bin/bash
# Downloads the sources whose line in sources.list still starts with "-" and writes
# their SHA-256 into the list. Look at what was downloaded before trusting it.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
out=$("$REPO/build/fetch.sh" | grep -E '^[0-9a-f]{64} ' || true)
while read -r sum url; do
  [ -n "$sum" ] || continue
  python3 - "$REPO/sources.list" "$sum" "$url" <<'PY'
import sys
path, digest, url = sys.argv[1:]
lines = open(path).read().split("\n")
open(path, "w").write("\n".join(f"{digest} {url}" if l == f"- {url}" else l for l in lines))
PY
  echo "pinned ${url##*/}"
done <<< "$out"
