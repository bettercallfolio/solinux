pkg=make ver=4.4.1 src=make-4.4.1.tar.gz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
