pkg=libpng ver=1.6.58 src=libpng-1.6.58.tar.xz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
