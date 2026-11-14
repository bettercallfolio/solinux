pkg=zlib ver=1.3.2 src=zlib-1.3.2.tar.gz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
  rm -f "${DEST:?}/usr/lib/libz.a"
}
