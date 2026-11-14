pkg=xorgproto ver=2025.1 src=xorgproto-2025.1.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release
  ninja
  DESTDIR="$DEST" ninja install
}
