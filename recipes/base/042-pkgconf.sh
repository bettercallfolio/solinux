pkg=pkgconf ver=3.0.5 src=pkgconf-3.0.5.tar.xz
build() {
  tar -xf "$S/meson-1.12.0.tar.gz"
  mkdir build && cd build
  python3 ../meson-1.12.0/meson.py setup --prefix=/usr --buildtype=release ..
  ninja
  DESTDIR="$DEST" ninja install
  ln -s pkgconf "$DEST/usr/bin/pkg-config"
  ln -s pkgconf.1 "$DEST/usr/share/man/man1/pkg-config.1"
}
