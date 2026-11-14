pkg=fribidi ver=1.0.16 src=fribidi-1.0.16.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D docs=false -D tests=false
  ninja
  DESTDIR="$DEST" ninja install
}
