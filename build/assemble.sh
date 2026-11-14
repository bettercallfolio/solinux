#!/bin/bash
# Puts a system together from the packages that were built: an empty directory, every
# package unpacked into it in the order it was built, and a record of what was installed.
# The result is a root file system (and one archive of it) that chainboot can publish
# and run.
#
#   assemble.sh <name> <stage>...        e.g.  assemble.sh solinux base solana desktop
#
# Needs sudo: the files must belong to root, as they will on the running system.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${WORK:-$HOME/build}
name=${1:?usage: assemble.sh <name> <stage>...}
shift
[ $# -gt 0 ] || { echo "name at least one stage (base, solana, desktop)"; exit 1; }

out=$WORK/images/$name
root=$out/rootfs
mkdir -p "$out"
if [ -e "$root" ]; then
  # An earlier result is moved aside, not deleted from here.
  old=$out/rootfs.old.$(date +%s)
  sudo mv "$root" "$old"
  echo "the previous result is now $old (remove it when it is no longer needed)"
fi
sudo mkdir -p "$root"

count=0
for stage in "$@"; do
  for recipe in "$REPO/recipes/$stage"/*.sh; do
    pkg=$(sed -n 's/^pkg=\([^ ]*\).*/\1/p' "$recipe" | head -n1)
    tar=$WORK/packages/$pkg.tar
    [ -f "$tar" ] || continue          # a recipe that makes no package (a check), or one not built yet
    sudo tar -C "$root" --keep-directory-symlink --numeric-owner -xpf "$tar"
    sudo install -d "$root/var/lib/solinux/pkg/$pkg"
    sudo install -m644 "$WORK/packages/$pkg.files" "$root/var/lib/solinux/pkg/$pkg/files"
    sudo install -m644 "$WORK/packages/$pkg.version" "$root/var/lib/solinux/pkg/$pkg/version"
    echo "$stage" | sudo tee "$root/var/lib/solinux/pkg/$pkg/set" > /dev/null
    count=$((count + 1))
  done
done

# The list of shared libraries, made by the system's own ldconfig.
sudo chroot "$root" /usr/sbin/ldconfig
echo "$name: $count packages, $(sudo du -sh "$root" | cut -f1) in $root"

# One archive of the whole system, with the same bytes every time for the same packages.
sudo tar -C "$root" --sort=name --numeric-owner --mtime=@1767225600 --clamp-mtime -cf "$out/$name.tar" .
sudo chown "$(id -u):$(id -g)" "$out/$name.tar"
echo "archive: $out/$name.tar ($(du -h "$out/$name.tar" | cut -f1))"
