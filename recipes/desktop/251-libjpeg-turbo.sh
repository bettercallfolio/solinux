pkg=libjpeg-turbo ver=3.2.0 src=libjpeg-turbo-3.2.0.tar.gz
build() {
  mkdir build && cd build
  cmake -D CMAKE_INSTALL_PREFIX=/usr -D CMAKE_BUILD_TYPE=RELEASE -D ENABLE_STATIC=FALSE \
    -D CMAKE_INSTALL_DEFAULT_LIBDIR=lib -D CMAKE_SKIP_INSTALL_RPATH=ON ..
  make
  make DESTDIR="$DEST" install
}
