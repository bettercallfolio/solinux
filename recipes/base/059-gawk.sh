pkg=gawk ver=5.4.1 src=gawk-5.4.1.tar.xz
build() {
  sed -i 's/extras//' Makefile.in
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
  rm -f "${DEST:?}/usr/bin/gawk-5.4.1"
  ln -s gawk.1 "$DEST/usr/share/man/man1/awk.1"
}
