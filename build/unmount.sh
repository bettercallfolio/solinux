#!/bin/bash
# Takes away everything chroot-stage.sh mounted into the build root.
WORK=${WORK:-$HOME/build}; ROOT=$WORK/root
for d in sol/tmp sol/packages sol/logs sol/state sol/sources sol/repo dev/shm dev/pts dev run sys proc; do
  mountpoint -q "$ROOT/$d" && sudo umount "$ROOT/$d"
done
exit 0
