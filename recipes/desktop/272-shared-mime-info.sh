pkg=shared-mime-info ver=2.5.1 src=shared-mime-info-2.5.1.tar.gz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D update-mimedb=false -D build-tests=false -D build-spec=false -D build-translations=false
  ninja
  DESTDIR="$DEST" ninja install
  # The database of file types, made from the descriptions just installed.
  ./update-mime-database "$DEST/usr/share/mime" || ./src/update-mime-database "$DEST/usr/share/mime"
}
