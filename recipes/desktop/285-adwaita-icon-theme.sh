pkg=adwaita-icon-theme ver=50.0 src=adwaita-icon-theme-50.0.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release
  ninja
  DESTDIR="$DEST" ninja install
}
