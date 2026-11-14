pkg=attr ver=2.6.0 src=attr-2.6.0.tar.gz
build() {
  ./configure --prefix=/usr --disable-static --sysconfdir=/etc
  make
  make DESTDIR="$DEST" install
}
