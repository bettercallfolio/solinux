pkg=automake ver=1.18.1 src=automake-1.18.1.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
