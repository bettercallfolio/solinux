pkg=imlib2 ver=1.12.6 src=imlib2-1.12.6.tar.xz
# Imlib2: a library that loads, scales and draws pictures.
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
