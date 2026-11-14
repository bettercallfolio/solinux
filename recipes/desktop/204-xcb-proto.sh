pkg=xcb-proto ver=1.17.0 src=xcb-proto-1.17.0.tar.xz
build() {
  export PYTHON=python3
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
