pkg=findutils ver=4.11.0 src=findutils-4.11.0.tar.xz
build() {
  ./configure --prefix=/usr --localstatedir=/var/lib/locate
  make
  make DESTDIR="$DEST" install
}
