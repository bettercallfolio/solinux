pkg=diffutils ver=3.12 src=diffutils-3.12.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
