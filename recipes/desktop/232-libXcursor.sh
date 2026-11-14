pkg=libXcursor ver=1.2.3 src=libXcursor-1.2.3.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
