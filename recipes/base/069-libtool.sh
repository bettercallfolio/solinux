pkg=libtool ver=2.6.2 src=libtool-2.6.2.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
  rm -f "${DEST:?}/usr/lib/libltdl.a"
}
