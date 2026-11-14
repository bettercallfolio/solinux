pkg=libXrandr ver=1.5.5 src=libXrandr-1.5.5.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
