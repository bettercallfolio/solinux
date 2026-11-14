pkg=libXdamage ver=1.1.7 src=libXdamage-1.1.7.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
