# Shared by every stage: where things are, and how one recipe is run.
#
#   WORK   the work area: sources/ root/ state/ logs/ packages/ tmp/
#   REPO   this repository
#
# A recipe is a small shell file that sets  pkg  ver  src  and defines  build().
# build() starts inside the unpacked source. In the packaged stages (base, solana, desktop) it must
# install into $DEST; the result becomes a package archive and is then installed for real.

set -euo pipefail
umask 022
set +h

: "${WORK:?WORK is not set}"
: "${REPO:?REPO is not set}"
S=$WORK/sources
export SOURCE_DATE_EPOCH=1767225600   # 2026-01-01: one date for every file we make
JOBS=${JOBS:-$(nproc)}
export MAKEFLAGS=-j$JOBS

say() { printf '%s\n' "$*"; }

is_elf() { [ "$(head -c 4 "$1" 2>/dev/null | tr -d '\0')" = $'\177ELF' ]; }

# Turns what build() left in $DEST into a package: merged /usr, no libtool
# archives, no documentation directory, stripped programs and libraries.
finish_package() {
  local id=$1 ver=$2 d f
  cd "$DEST"
  for d in bin sbin lib; do
    if [ -d "$d" ] && [ ! -L "$d" ]; then
      mkdir -p "usr/$d"; cp -a "$d"/. "usr/$d"/; rm -rf "$d"
    fi
  done
  rm -rf usr/share/info/dir usr/share/doc
  find . -name '*.la' -delete
  if command -v strip >/dev/null; then
    # (a package need not have any of these directories: "|| true" keeps a missing one from stopping the build)
    { find usr/bin usr/sbin usr/libexec -type f 2>/dev/null || true; } | while read -r f; do
      if is_elf "$f"; then chmod u+w "$f"; strip --strip-unneeded "$f" 2>/dev/null || true; fi
    done
    { find usr/lib -type f \( -name '*.so' -o -name '*.so.*' \) \
         ! -path 'usr/lib/grub/*' ! -path 'usr/lib/modules/*' ! -path 'usr/lib/firmware/*' 2>/dev/null || true; } | while read -r f; do
      if is_elf "$f"; then
        local mode; mode=$(stat -c %a "$f"); chmod u+w "$f"
        strip --strip-unneeded "$f" 2>/dev/null || true; chmod "$mode" "$f"
      fi
    done
    { find usr/lib -type f -name '*.a' ! -path 'usr/lib/grub/*' 2>/dev/null || true; } | while read -r f; do
      strip --strip-debug "$f" 2>/dev/null || true
    done
  fi
  mkdir -p "$WORK/packages"
  find . -mindepth 1 | LC_ALL=C sort | sed 's|^\./||' > "$WORK/packages/$id.files"
  echo "$ver" > "$WORK/packages/$id.version"
  tar --sort=name --numeric-owner --mtime="@$SOURCE_DATE_EPOCH" --clamp-mtime -cf "$WORK/packages/$id.tar" .
  tar -cf - . | tar -C / --keep-directory-symlink -xf -
  if [ -x /usr/sbin/ldconfig ] || [ -x /sbin/ldconfig ]; then ldconfig 2>/dev/null || true; fi
}

# The stages whose recipes install into $DEST and become packages.
packaged() { [ "$1" = base ] || [ "$1" = solana ] || [ "$1" = desktop ] || [ "$1" = apps ]; }

# run_recipe <stage> <file>
run_recipe() {
  local stage=$1 file=$2
  (
    pkg='' ver='' src=''
    unset -f build 2>/dev/null || true
    . "$file"
    [ -n "$pkg" ] || { say "recipe $file sets no pkg"; exit 1; }
    mark=$WORK/state/$stage/$pkg.done
    log=$WORK/logs/$stage/$pkg.log
    [ -e "$mark" ] && exit 0
    mkdir -p "$WORK/state/$stage" "$WORK/logs/$stage" "$WORK/tmp"
    dir=$WORK/tmp/$stage-$pkg
    rm -rf "${dir:?}"; mkdir -p "$dir"; cd "$dir"
    [ -z "$src" ] || tar -xf "$S/$src" --strip-components=1
    if packaged "$stage"; then
      export DEST=$WORK/tmp/dest-$pkg
      rm -rf "${DEST:?}"; mkdir -p "$DEST"
    fi
    t0=$SECONDS
    printf '%s  %-22s %s\n' "$(date +%H:%M:%S)" "$stage/$pkg" "$ver"
    set +e
    ( set -e; build ) > "$log" 2>&1
    rc=$?
    if [ $rc -eq 0 ] && packaged "$stage"; then
      ( set -e; finish_package "$pkg" "$ver" ) >> "$log" 2>&1
      rc=$?
    fi
    set -e
    if [ $rc -ne 0 ]; then
      say "FAILED: $stage/$pkg (log: $log)"; tail -n 30 "$log"; exit 1
    fi
    cd /; rm -rf "${dir:?}"
    ! packaged "$stage" || rm -rf "${DEST:?}"
    touch "$mark"
    printf '          %-22s done in %s s\n' "" "$((SECONDS - t0))"
  )
}

# run_stage <stage>: every recipe of the stage, in the order of its file names.
run_stage() {
  local stage=$1 f
  for f in "$REPO/recipes/$stage"/*.sh; do
    run_recipe "$stage" "$f"
  done
  say "stage $stage: complete"
}
