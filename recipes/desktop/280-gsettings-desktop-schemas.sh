pkg=gsettings-desktop-schemas ver=50.1 src=gsettings-desktop-schemas-50.1.tar.xz
build() {
  sed -i -r 's:"(/system):"/org/gnome\1:g' schemas/*.in
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D introspection=false
  ninja
  DESTDIR="$DEST" ninja install
}
