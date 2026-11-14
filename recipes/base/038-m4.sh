pkg=m4 ver=1.4.21 src=m4-1.4.21.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
