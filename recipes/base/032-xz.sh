pkg=xz ver=5.8.3 src=xz-5.8.3.tar.xz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
