pkg=libfontenc ver=1.1.9 src=libfontenc-1.1.9.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
