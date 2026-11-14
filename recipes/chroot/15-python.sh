pkg=python ver=3.14.7 src=Python-3.14.7.tar.xz
build() {
  ./configure --prefix=/usr --enable-shared --without-ensurepip --without-static-libpython
  make
  make install
}
