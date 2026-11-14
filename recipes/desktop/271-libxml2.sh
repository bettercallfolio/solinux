pkg=libxml2 ver=2.15.3 src=libxml2-2.15.3.tar.xz
build() {
  sed -i "/'git'/,+3d" meson.build
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D history=enabled -D icu=disabled -D python=disabled -D docs=disabled
  ninja
  DESTDIR="$DEST" ninja install
}
