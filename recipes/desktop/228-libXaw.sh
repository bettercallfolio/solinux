pkg=libXaw ver=1.0.16 src=libXaw-1.0.16.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
