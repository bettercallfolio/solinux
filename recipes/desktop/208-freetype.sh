pkg=freetype ver=2.14.3 src=freetype-2.14.3.tar.xz
build() {
  sed -ri "s:.*(AUX_MODULES.*valid):\1:" modules.cfg
  sed -r "s:.*(#.*SUBPIXEL_RENDERING) .*:\1:" -i include/freetype/config/ftoption.h
  ./configure --prefix=/usr --disable-static --enable-freetype-config --with-harfbuzz=dynamic
  make
  make DESTDIR="$DEST" install
}
