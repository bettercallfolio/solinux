pkg=sed ver=4.10 src=sed-4.10.tar.xz
build() {
  ./configure --prefix=/usr --host="$TARGET" --build="$(./build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
