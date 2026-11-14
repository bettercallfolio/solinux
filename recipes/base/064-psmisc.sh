pkg=psmisc ver=23.7 src=psmisc-23.7.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
