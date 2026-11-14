#!/bin/bash
# Downloads every source archive named in sources.list into $WORK/sources and
# checks its SHA-256. Lines:  <sha256> <url>   ("-" as the hash records a new one.)
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-$HOME/build}
mkdir -p "$WORK/sources"; cd "$WORK/sources"
fail=0
fetch_one() {
  local sum=$1 url=$2 file=${2##*/}
  if [ ! -s "$file" ]; then
    curl -fsSL --retry 3 -A "Mozilla/5.0" -o "$file.part" "$url" && mv "$file.part" "$file" || { echo "cannot download $url"; return 1; }
  fi
  local got; got=$(sha256sum "$file" | cut -d' ' -f1)
  if [ "$sum" = - ]; then echo "$got $url"; return 0; fi
  [ "$got" = "$sum" ] || { echo "WRONG HASH: $file"; return 1; }
}
export -f fetch_one
grep -v -E '^\s*(#|$)' "$REPO/sources.list" | xargs -P 8 -n 2 bash -c 'fetch_one "$0" "$1"' || fail=1
[ $fail -eq 0 ] && echo "sources: complete" || { echo "sources: some failed"; exit 1; }
