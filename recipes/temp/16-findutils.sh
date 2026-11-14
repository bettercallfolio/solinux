pkg=findutils ver=4.11.0 src=findutils-4.11.0.tar.xz
build() {
  ./configure --prefix=/usr --localstatedir=/var/lib/locate --host="$TARGET" --build="$(build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
