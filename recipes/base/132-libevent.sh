pkg=libevent ver=2.1.13 src=libevent-2.1.13-stable.tar.gz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
