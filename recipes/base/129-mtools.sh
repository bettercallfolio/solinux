pkg=mtools ver=4.0.50 src=mtools-4.0.50.tar.bz2
build() {
  ./configure --prefix=/usr --sysconfdir=/etc
  make
  make DESTDIR="$DEST" install
}
