pkg=libxkbfile ver=1.2.0 src=libxkbfile-1.2.0.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release
  ninja
  DESTDIR="$DEST" ninja install
}
