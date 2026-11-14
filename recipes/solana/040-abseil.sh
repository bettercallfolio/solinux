pkg=abseil ver=20260526.0 src=abseil-cpp-20260526.0.tar.gz
build() {
  mkdir build && cd build
  cmake -D CMAKE_INSTALL_PREFIX=/usr -D CMAKE_BUILD_TYPE=Release -D CMAKE_SKIP_INSTALL_RPATH=ON \
    -D ABSL_PROPAGATE_CXX_STD=ON -D BUILD_SHARED_LIBS=ON -G Ninja ..
  ninja
  DESTDIR="$DEST" ninja install
}
