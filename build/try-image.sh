#!/bin/bash
# Runs an assembled system on this computer the way chainboot runs a machine: a root of its
# own, this computer's kernel and network. The assembled files are not changed: everything
# the system writes goes into a layer on top of them.
#
#   try-image.sh <name> start      bring it up (and its desktop, if it has one); says where the desktop is
#   try-image.sh <name> sh [cmd]   a root shell inside it, or one command
#   try-image.sh <name> stop       end every program in it and take the mounts away
#
# Needs sudo.
set -euo pipefail
WORK=${WORK:-$HOME/build}
name=${1:?usage: try-image.sh <name> start|sh|stop}
action=${2:-start}
out=$WORK/images/$name
lower=$out/rootfs
t=$out/try
m=$t/merged
[ -d "$lower" ] || { echo "there is no assembled system $name (run assemble.sh first)"; exit 1; }

inside() { sudo chroot "$m" /usr/bin/env -i HOME=/root TERM="${TERM:-xterm}" LANG=C.UTF-8 PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin "$@"; }
mounted() { mountpoint -q "$1"; }

case $action in
  start)
    sudo mkdir -p "$t/upper" "$t/work" "$m"
    mounted "$m" || sudo mount -t overlay overlay -o "lowerdir=$lower,upperdir=$t/upper,workdir=$t/work" "$m"
    mounted "$m/proc" || sudo mount -t proc proc "$m/proc"
    mounted "$m/sys" || sudo mount -t sysfs sysfs "$m/sys"
    mounted "$m/dev" || sudo mount --rbind /dev "$m/dev"
    mounted "$m/run" || sudo mount -t tmpfs tmpfs "$m/run"
    mounted "$m/tmp" || sudo mount -t tmpfs tmpfs "$m/tmp"
    # name resolution: the system's resolv.conf points at a service that only a booted system runs
    sudo mkdir -p "$m/run/systemd/resolve"
    sudo cp -L /etc/resolv.conf "$m/run/systemd/resolve/stub-resolv.conf"
    if [ -x "$m/etc/chainboot/start" ]; then
      sudo rm -f "$m/root/.local/state/solinux/desk.url"
      sudo sh -c "setsid chroot '$m' /bin/sh -c 'cd /; exec /etc/chainboot/start' > '$t/start.log' 2>&1 &"
      for _ in $(seq 1 100); do sudo test -s "$m/root/.local/state/solinux/desk.url" && break; sleep 0.1; done
      if sudo test -s "$m/root/.local/state/solinux/desk.url"; then echo "desktop: $(sudo cat "$m/root/.local/state/solinux/desk.url")"
      else echo "the desktop did not come up; see $t/start.log"; sudo tail -n 20 "$t/start.log" || true; fi
    fi
    echo "$name is up. A shell inside it: $0 $name sh"
    ;;
  sh)
    mounted "$m" || { echo "$name is not up: $0 $name start"; exit 1; }
    shift 2
    if [ $# -gt 0 ]; then inside /bin/bash -lc "$*"; else inside /bin/bash -l; fi
    ;;
  stop)
    # every program whose root is this system
    for p in /proc/[0-9]*; do
      [ "$(sudo readlink "$p/root" 2>/dev/null)" = "$m" ] && sudo kill "${p#/proc/}" 2>/dev/null || true
    done
    sleep 1
    for p in /proc/[0-9]*; do
      [ "$(sudo readlink "$p/root" 2>/dev/null)" = "$m" ] && sudo kill -9 "${p#/proc/}" 2>/dev/null || true
    done
    for d in tmp run dev proc sys; do
      # (lazily: /dev came with this computer's mounts below it, some of them in use elsewhere)
      mounted "$m/$d" && sudo umount -R -l "$m/$d" || true
    done
    mounted "$m" && sudo umount -l "$m" || true
    echo "$name is stopped. What it wrote is in $t/upper."
    ;;
  *) echo "usage: try-image.sh <name> start|sh|stop"; exit 1 ;;
esac
