pkg=gettext ver=1.0 src=gettext-1.0.tar.xz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
  chmod 0755 "$DEST/usr/lib/preloadable_libintl.so"
}
