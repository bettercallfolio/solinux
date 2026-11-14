pkg=nano ver=9.2 src=nano-9.2.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --enable-utf8
  make
  make DESTDIR="$DEST" install
}
