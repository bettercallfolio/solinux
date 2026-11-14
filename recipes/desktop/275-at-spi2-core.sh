pkg=at-spi2-core ver=2.60.6 src=at-spi2-core-2.60.6.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D gtk2_atk_adaptor=false -D introspection=disabled -D docs=false
  ninja
  DESTDIR="$DEST" ninja install
}
