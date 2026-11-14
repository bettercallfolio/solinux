pkg=hicolor-icon-theme ver=0.18 src=hicolor-icon-theme-0.18.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release
  ninja
  DESTDIR="$DEST" ninja install
}
