pkg=libXxf86vm ver=1.1.7 src=libXxf86vm-1.1.7.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
