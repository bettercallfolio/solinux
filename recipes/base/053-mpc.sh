pkg=mpc ver=1.4.1 src=mpc-1.4.1.tar.xz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
