pkg=bzip2 ver=1.0.8 src=bzip2-1.0.8.tar.gz
build() {
  sed -i 's@\(ln -s -f \)$(PREFIX)/bin/@\1@' Makefile
  sed -i "s@(PREFIX)/man@(PREFIX)/share/man@g" Makefile
  make -f Makefile-libbz2_so
  make clean
  make
  make PREFIX="$DEST/usr" install
  cp -a libbz2.so.* "$DEST/usr/lib"
  ln -sf libbz2.so.1.0.8 "$DEST/usr/lib/libbz2.so"
  ln -sf libbz2.so.1.0.8 "$DEST/usr/lib/libbz2.so.1"
  cp bzip2-shared "$DEST/usr/bin/bzip2"
  ln -sf bzip2 "$DEST/usr/bin/bzcat"
  ln -sf bzip2 "$DEST/usr/bin/bunzip2"
  rm -f "${DEST:?}/usr/lib/libbz2.a"
}
