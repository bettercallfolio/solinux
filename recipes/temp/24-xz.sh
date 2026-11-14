pkg=xz ver=5.8.3 src=xz-5.8.3.tar.xz
build() {
  ./configure --prefix=/usr --host="$TARGET" --build="$(build-aux/config.guess)" --disable-static
  make
  make DESTDIR="$ROOT" install
  rm -f "${ROOT:?}/usr/lib/liblzma.la"
}
