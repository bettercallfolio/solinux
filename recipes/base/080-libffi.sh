pkg=libffi ver=3.8.0 src=libffi-3.8.0.tar.gz
build() {
  # x86-64: code for any 64-bit PC, not only the processor this was built on.
  ./configure --prefix=/usr --disable-static --with-gcc-arch=x86-64
  make
  make DESTDIR="$DEST" install
}
