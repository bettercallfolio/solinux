pkg=libpipeline ver=1.5.8 src=libpipeline-1.5.8.tar.gz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
