pkg=kmod ver=34.2 src=kmod-34.2.tar.xz
build() {
  mkdir build && cd build
  meson setup --prefix=/usr .. --buildtype=release -D manpages=false
  ninja
  DESTDIR="$DEST" ninja install
}
