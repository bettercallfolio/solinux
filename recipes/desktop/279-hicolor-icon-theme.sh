pkg=hicolor-icon-theme ver=0.18 src=hicolor-icon-theme-0.18.tar.xz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
