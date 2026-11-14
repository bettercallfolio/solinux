pkg=libxkbcommon ver=1.13.2 src=libxkbcommon-1.13.2.tar.gz
build() {
  patch -Np1 -i "$S/libxkbcommon-1.13.2-upstream_fix-1.patch"
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D enable-docs=false -D enable-wayland=false -D enable-tools=false
  ninja
  DESTDIR="$DEST" ninja install
}
