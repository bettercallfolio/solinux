pkg=sed ver=4.10 src=sed-4.10.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
