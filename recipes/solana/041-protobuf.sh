pkg=protobuf ver=35.1 src=protobuf-35.1.tar.gz
# protoc: Agave turns its .proto files into Rust with it.
build() {
  mkdir build && cd build
  cmake -D CMAKE_INSTALL_PREFIX=/usr -D CMAKE_BUILD_TYPE=Release -D CMAKE_SKIP_INSTALL_RPATH=ON \
    -D protobuf_BUILD_TESTS=OFF -D protobuf_BUILD_SHARED_LIBS=ON -G Ninja ..
  ninja
  DESTDIR="$DEST" ninja install
}
