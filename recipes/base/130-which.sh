pkg=which ver=2.25 src=which-2.25.tar.gz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
