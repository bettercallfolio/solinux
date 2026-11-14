pkg=gdk-pixbuf ver=2.44.7 src=gdk-pixbuf-2.44.7.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release --wrap-mode=nofallback -D png=enabled -D jpeg=enabled -D gif=enabled -D tiff=disabled -D glycin=disabled -D thumbnailer=disabled -D introspection=disabled -D man=false -D tests=false -D installed_tests=false
  ninja
  DESTDIR="$DEST" ninja install
  # Which picture formats it reads: listed once, here, for the files of this package.
  ( cd "$DEST" && LD_LIBRARY_PATH="$DEST/usr/lib" GDK_PIXBUF_MODULEDIR="$DEST"/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders usr/bin/gdk-pixbuf-query-loaders | sed "s|$DEST||g" > usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache ) || true
}
