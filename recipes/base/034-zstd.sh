pkg=zstd ver=1.5.7 src=zstd-1.5.7.tar.gz
build() {
  make prefix=/usr
  make prefix=/usr DESTDIR="$DEST" install
  rm -f "${DEST:?}/usr/lib/libzstd.a"
}
