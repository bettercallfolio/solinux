pkg=lz4 ver=1.10.0 src=lz4-1.10.0.tar.gz
build() {
  make BUILD_STATIC=no PREFIX=/usr
  make BUILD_STATIC=no PREFIX=/usr DESTDIR="$DEST" install
}
