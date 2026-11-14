pkg=libXt ver=1.3.1 src=libXt-1.3.1.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static --with-appdefaultdir=/etc/X11/app-defaults
  make
  make DESTDIR="$DEST" install
}
