pkg=libXinerama ver=1.1.6 src=libXinerama-1.1.6.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
