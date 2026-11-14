pkg=make ver=4.4.1 src=make-4.4.1.tar.gz
build() {
  ./configure --prefix=/usr --host="$TARGET" --build="$(build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
