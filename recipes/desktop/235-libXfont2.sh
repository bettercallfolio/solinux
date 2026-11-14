pkg=libXfont2 ver=2.0.9 src=libXfont2-2.0.9.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static --disable-devel-docs
  make
  make DESTDIR="$DEST" install
}
