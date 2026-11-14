pkg=mpfr ver=4.2.2 src=mpfr-4.2.2.tar.xz
build() {
  ./configure --prefix=/usr --disable-static --enable-thread-safe
  make
  make DESTDIR="$DEST" install
}
