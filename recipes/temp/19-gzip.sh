pkg=gzip ver=1.14 src=gzip-1.14.tar.xz
build() {
  ./configure --prefix=/usr --host="$TARGET"
  make
  make DESTDIR="$ROOT" install
}
