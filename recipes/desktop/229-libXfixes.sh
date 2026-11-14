pkg=libXfixes ver=6.0.2 src=libXfixes-6.0.2.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
