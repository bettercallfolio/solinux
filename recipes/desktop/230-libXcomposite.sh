pkg=libXcomposite ver=0.4.7 src=libXcomposite-0.4.7.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
