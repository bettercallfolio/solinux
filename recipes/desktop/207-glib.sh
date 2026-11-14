pkg=glib ver=2.88.3 src=glib-2.88.3.tar.xz
# The library under GTK and most graphical programs.
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D introspection=disabled -D glib_debug=disabled -D man-pages=disabled -D sysprof=disabled -D tests=false
  ninja
  DESTDIR="$DEST" ninja install
}
