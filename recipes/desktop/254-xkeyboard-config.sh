pkg=xkeyboard-config ver=2.48 src=xkeyboard-config-2.48.tar.xz
# The keyboard layouts of the world.
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release
  ninja
  DESTDIR="$DEST" ninja install
}
