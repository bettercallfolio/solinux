pkg=harfbuzz ver=14.3.1 src=harfbuzz-14.3.1.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D tests=disabled -D docs=disabled -D introspection=disabled
  ninja
  DESTDIR="$DEST" ninja install
}
