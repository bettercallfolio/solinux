pkg=librsvg ver=2.62.3 src=librsvg-2.62.3.tar.xz
# Draws SVG pictures: the icons of the desktop's applications are SVG.
build() {
  export CARGO_HOME=$PWD/.cargo-home
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D introspection=disabled -D docs=disabled -D vala=disabled -D tests=false -D pixbuf-loader=enabled
  ninja
  DESTDIR="$DEST" ninja install
}
