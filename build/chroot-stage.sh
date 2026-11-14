#!/bin/bash
# Runs a stage inside the new system: chroot (temporary tools), base (the real packages),
# or any command (chroot-stage.sh sh). Needs sudo for mounting and chroot.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-$HOME/build}
ROOT=$WORK/root
stage=${1:?usage: chroot-stage.sh chroot|base|sh}

if [ ! -e "$WORK/state/root-owned" ]; then
  sudo chown -R root:root "$ROOT"
  mkdir -p "$WORK/state"; touch "$WORK/state/root-owned"
fi
sudo mkdir -p "$ROOT"/{dev,proc,sys,run} "$ROOT"/sol/{repo,sources,state,logs,packages,tmp}
mkdir -p "$WORK"/{state,logs,packages,tmp}
m() { mountpoint -q "$2" || sudo mount "${@:3}" "$1" "$2"; }
m /dev "$ROOT/dev" --bind
m devpts "$ROOT/dev/pts" -t devpts -o gid=5,mode=0620
m proc "$ROOT/proc" -t proc
m sysfs "$ROOT/sys" -t sysfs
m tmpfs "$ROOT/run" -t tmpfs
m tmpfs "$ROOT/dev/shm" -t tmpfs -o nosuid,nodev
m "$REPO" "$ROOT/sol/repo" --bind -o ro
m "$WORK/sources" "$ROOT/sol/sources" --bind -o ro
for d in state logs packages tmp; do m "$WORK/$d" "$ROOT/sol/$d" --bind; done

run() { sudo chroot "$ROOT" /usr/bin/env -i HOME=/root TERM=xterm PATH=/usr/bin:/usr/sbin \
          WORK=/sol REPO=/sol/repo JOBS="$(nproc)" "$@"; }
if [ "$stage" = sh ]; then shift; run /bin/bash "$@"
else run /bin/bash -c '. /sol/repo/build/lib.sh; run_stage "$1"' _ "$stage"; fi
