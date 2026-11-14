pkg=file ver=5.48 src=file-5.48.tar.gz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
