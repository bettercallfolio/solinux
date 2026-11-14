pkg=libepoxy ver=1.5.10 src=libepoxy-1.5.10.tar.xz
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D egl=no -D glx=yes -D x11=true -D tests=false -D docs=false
  ninja
  DESTDIR="$DEST" ninja install
}
