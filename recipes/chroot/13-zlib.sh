pkg=zlib ver=1.3.2 src=zlib-1.3.2.tar.gz
build() {
  ./configure --prefix=/usr
  make
  make install
  rm -f /usr/lib/libz.a
}
