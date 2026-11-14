pkg=less ver=704 src=less-704.tar.gz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc
  make
  make DESTDIR="$DEST" install
}
