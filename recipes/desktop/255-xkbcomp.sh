pkg=xkbcomp ver=1.5.0 src=xkbcomp-1.5.0.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
