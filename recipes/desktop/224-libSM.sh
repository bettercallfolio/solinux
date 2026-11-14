pkg=libSM ver=1.2.6 src=libSM-1.2.6.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
