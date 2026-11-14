pkg=gawk ver=5.4.1 src=gawk-5.4.1.tar.xz
build() {
  sed -i 's/extras//' Makefile.in
  ./configure --prefix=/usr --host="$TARGET" --build="$(build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
