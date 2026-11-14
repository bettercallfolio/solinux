pkg=bison ver=3.8.2 src=bison-3.8.2.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make install
}
