pkg=patch ver=2.8 src=patch-2.8.tar.xz
build() {
  ./configure --prefix=/usr --host="$TARGET" --build="$(build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
