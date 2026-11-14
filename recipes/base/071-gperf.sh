pkg=gperf ver=3.3 src=gperf-3.3.tar.gz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
