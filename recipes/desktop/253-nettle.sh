pkg=nettle ver=4.0 src=nettle-4.0.tar.gz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
  chmod 755 "$DEST"/usr/lib/lib{hogweed,nettle}.so
}
