pkg=expat ver=2.8.3 src=expat-2.8.3.tar.xz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
