pkg=gzip ver=1.14 src=gzip-1.14.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
