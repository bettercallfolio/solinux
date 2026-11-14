pkg=file ver=5.48 src=file-5.48.tar.gz
build() {
  mkdir build
  ( cd build && ../configure --disable-bzlib --disable-libseccomp --disable-xzlib --disable-zlib && make )
  ./configure --prefix=/usr --host="$TARGET" --build="$(./config.guess)"
  make FILE_COMPILE="$(pwd)/build/src/file"
  make DESTDIR="$ROOT" install
  rm -f "${ROOT:?}/usr/lib/libmagic.la"
}
