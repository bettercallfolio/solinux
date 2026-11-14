pkg=initramfs ver=0.1
# The first, tiny file system a booted kernel sees: it finds the real one and hands over.
build() {
  local rel; rel=$(ls /usr/lib/modules | sort -V | tail -n1)
  local t=$PWD/tree f lib
  mkdir -p "$t"/{bin,dev,proc,sys,run,sysroot,usr/lib,lib64,etc}
  ln -s usr/lib "$t/lib"
  ln -s ../bin "$t/usr/bin"
  ln -s bin "$t/sbin"
  for f in bash cat ls mkdir sleep mount umount switch_root findfs blkid dmesg; do
    cp "$(command -v "$f")" "$t/bin/"
  done
  ln -s bash "$t/bin/sh"
  # Every library those programs load, and the loader itself.
  for f in "$t"/bin/*; do
    [ -L "$f" ] && continue
    ldd "$f" | awk '$3 ~ /^\// { print $3 } $1 ~ /^\// { print $1 }'
  done | sort -u | while read -r lib; do
    cp -L "$lib" "$t/usr/lib/"
  done
  ln -s ../usr/lib/ld-linux-x86-64.so.2 "$t/lib64/ld-linux-x86-64.so.2"
  mknod -m 600 "$t/dev/console" c 5 1
  mknod -m 666 "$t/dev/null" c 1 3
  install -m755 "$REPO/boot/init" "$t/init"
  mkdir -p "$DEST/boot"
  ( cd "$t" && find . -mindepth 1 | LC_ALL=C sort | cpio -o -H newc --reproducible --quiet | zstd -19 -T0 ) > "$DEST/boot/initrd.img-$rel"
}
