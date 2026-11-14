pkg=coreutils ver=9.11 src=coreutils-9.11.tar.xz
build() {
  ./configure --prefix=/usr --host="$TARGET" --build="$(build-aux/config.guess)" --enable-install-program=hostname
  make
  make DESTDIR="$ROOT" install
  mv "$ROOT/usr/bin/chroot" "$ROOT/usr/sbin"
}
