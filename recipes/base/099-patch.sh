pkg=patch ver=2.8 src=patch-2.8.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
