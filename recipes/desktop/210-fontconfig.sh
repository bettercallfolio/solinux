pkg=fontconfig ver=2.18.3 src=fontconfig-2.18.3.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-docs
  make
  make DESTDIR="$DEST" install
}
