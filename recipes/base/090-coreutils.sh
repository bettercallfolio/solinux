pkg=coreutils ver=9.11 src=coreutils-9.11.tar.xz
build() {
  patch -Np1 -i "$S/coreutils-9.11-i18n-1.patch"
  autoreconf -fv
  automake -af
  FORCE_UNSAFE_CONFIGURE=1 ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
  mkdir -p "$DEST/usr/sbin" "$DEST/usr/share/man/man8"
  mv "$DEST/usr/bin/chroot" "$DEST/usr/sbin/chroot"
  mv "$DEST/usr/share/man/man1/chroot.1" "$DEST/usr/share/man/man8/chroot.8"
  sed -i 's/"1"/"8"/' "$DEST/usr/share/man/man8/chroot.8"
}
