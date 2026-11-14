pkg=texinfo ver=7.3 src=texinfo-7.3.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
