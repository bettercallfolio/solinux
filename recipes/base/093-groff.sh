pkg=groff ver=1.24.1 src=groff-1.24.1.tar.gz
build() {
  PAGE=A4 ./configure --prefix=/usr
  make -j1
  make DESTDIR="$DEST" install
}
