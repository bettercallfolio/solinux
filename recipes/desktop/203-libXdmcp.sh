pkg=libXdmcp ver=1.1.5 src=libXdmcp-1.1.5.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
