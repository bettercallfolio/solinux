pkg=procps-ng ver=4.0.7 src=procps-ng-4.0.7.tar.xz
build() {
  ./configure --prefix=/usr --disable-static --disable-kill --enable-watch8bit --with-systemd
  make
  make DESTDIR="$DEST" install
}
