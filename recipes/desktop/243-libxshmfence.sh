pkg=libxshmfence ver=1.3.3 src=libxshmfence-1.3.3.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
