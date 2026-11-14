pkg=libXpm ver=3.5.19 src=libXpm-3.5.19.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static --disable-open-zfile
  make
  make DESTDIR="$DEST" install
}
