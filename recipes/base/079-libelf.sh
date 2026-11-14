pkg=libelf ver=0.195 src=elfutils-0.195.tar.bz2
build() {
  ./configure --prefix=/usr --disable-debuginfod --enable-libdebuginfod=dummy
  make -C lib
  make -C libelf
  make -C libelf DESTDIR="$DEST" install
  install -Dm644 config/libelf.pc "$DEST/usr/lib/pkgconfig/libelf.pc"
  rm -f "${DEST:?}/usr/lib/libelf.a"
}
