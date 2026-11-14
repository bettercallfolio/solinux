pkg=tar ver=1.35 src=tar-1.35.tar.xz
build() {
  ./configure --prefix=/usr --host="$TARGET" --build="$(build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
