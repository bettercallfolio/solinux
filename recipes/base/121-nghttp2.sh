pkg=nghttp2 ver=1.70.0 src=nghttp2-1.70.0.tar.xz
build() {
  ./configure --prefix=/usr --disable-static --enable-lib-only
  make
  make DESTDIR="$DEST" install
}
