pkg=grep ver=3.12 src=grep-3.12.tar.xz
build() {
  ./configure --prefix=/usr --host="$TARGET" --build="$(./build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
