pkg=gdbm ver=1.26 src=gdbm-1.26.tar.gz
build() {
  ./configure --prefix=/usr --disable-static --enable-libgdbm-compat
  make
  make DESTDIR="$DEST" install
}
