pkg=pixman ver=0.46.4 src=pixman-0.46.4.tar.gz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D tests=disabled -D demos=disabled
  ninja
  DESTDIR="$DEST" ninja install
}
