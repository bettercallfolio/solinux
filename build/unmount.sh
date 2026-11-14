#!/bin/bash
# Takes away everything chroot-stage.sh mounted into the build root.
WORK=${WORK:-$HOME/build}; ROOT=$WORK/root
for d in sol/tmp sol/packages sol/logs sol/state sol/sources sol/repo run sys proc; do
  mountpoint -q "$ROOT/$d" && sudo umount "$ROOT/$d"
done
# /dev last, with what is mounted below it. First cut loose from this computer's own /dev:
# taking away a mount that is still shared with it would take /dev/pts and /dev/shm away there too.
if mountpoint -q "$ROOT/dev"; then
  sudo mount --make-rprivate "$ROOT/dev" && sudo umount -R "$ROOT/dev"
fi
exit 0
