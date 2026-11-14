#!/bin/bash
# Downloads every source archive named in sources.list into $WORK/sources and
# checks its SHA-256. Lines:  <sha256> <url>   ("-" as the hash records a new one.)
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-$HOME/build}
mkdir -p "$WORK/sources"; cd "$WORK/sources"
fail=0
fetch_one() {
  # "address#name" saves the download under that name (for addresses that end in something like v1.2.tar.gz)
  local sum=$1 url=${2%%#*} file=${2##*[/#]}
  if [ ! -s "$file" ]; then
    # Some hosts refuse a client that does not name a browser; others answer a browser with a
    # page that asks it to prove it is one. So: plainly first, as a browser second, and a web
    # page where an archive was asked for counts as no download.
    local agent ok=
    for agent in "curl/8" "Mozilla/5.0"; do
      curl -fsSL --retry 3 -A "$agent" -o "$file.part" "$url" || continue
      case $file in
        *.tar.*|*.tgz|*.zip) head -c 512 "$file.part" | grep -qi '<html\|<!doctype' && continue ;;
      esac
      ok=1; break
    done
    [ -n "$ok" ] && mv "$file.part" "$file" || { echo "cannot download $url"; return 1; }
  fi
  local got; got=$(sha256sum "$file" | cut -d' ' -f1)
  if [ "$sum" = - ]; then echo "$got $2"; return 0; fi
  [ "$got" = "$sum" ] || { echo "WRONG HASH: $file"; return 1; }
}
export -f fetch_one
grep -v -E '^\s*(#|$)' "$REPO/sources.list" | xargs -P 8 -n 2 bash -c 'fetch_one "$0" "$1"' || fail=1
[ $fail -eq 0 ] && echo "sources: complete" || { echo "sources: some failed"; exit 1; }
