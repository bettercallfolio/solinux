pkg=libxcvt ver=0.1.3 src=libxcvt-0.1.3.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release
  ninja
  DESTDIR="$DEST" ninja install
}
