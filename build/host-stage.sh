#!/bin/bash
# Runs a stage that is built on the host with the cross toolchain: cross, temp.
# The environment is emptied first, so nothing of the host's leaks into the build.
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-$HOME/build}
stage=${1:?usage: host-stage.sh cross|temp}
mkdir -p "$WORK/root"
exec env -i HOME="$HOME" TERM=xterm LC_ALL=POSIX \
  WORK="$WORK" REPO="$REPO" ROOT="$WORK/root" TARGET=x86_64-solinux-linux-gnu \
  PATH="$WORK/root/tools/bin:/usr/bin" CONFIG_SITE="$WORK/root/usr/share/config.site" \
  /bin/bash -c '. "$REPO/build/lib.sh"; run_stage "$1"' _ "$stage"
