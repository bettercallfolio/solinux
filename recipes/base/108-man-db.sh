pkg=man-db ver=2.13.1 src=man-db-2.13.1.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --disable-setuid --enable-cache-owner=bin \
    --with-browser=/usr/bin/lynx --with-vgrind=/usr/bin/vgrind --with-grap=/usr/bin/grap
  make
  make DESTDIR="$DEST" install
}
