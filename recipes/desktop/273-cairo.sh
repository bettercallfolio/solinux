pkg=cairo ver=1.18.4 src=cairo-1.18.4.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D tests=disabled
  ninja
  DESTDIR="$DEST" ninja install
}
