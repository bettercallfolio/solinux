pkg=htop ver=3.5.3 src=htop-3.5.3.tar.xz
build() {
  ./configure --prefix=/usr --sysconfdir=/etc
  make
  make DESTDIR="$DEST" install
}
