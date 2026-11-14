pkg=libdrm ver=2.4.134 src=libdrm-2.4.134.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D udev=true -D valgrind=disabled -D tests=false
  ninja
  DESTDIR="$DEST" ninja install
}
