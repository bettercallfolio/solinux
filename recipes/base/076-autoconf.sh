pkg=autoconf ver=2.73 src=autoconf-2.73.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
