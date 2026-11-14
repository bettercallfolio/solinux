pkg=pango ver=1.58.2 src=pango-1.58.2.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release --wrap-mode=nofallback -D introspection=disabled -D build-testsuite=false -D build-examples=false
  ninja
  DESTDIR="$DEST" ninja install
}
