pkg=mpdecimal ver=4.0.1 src=mpdecimal-4.0.1.tar.gz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
