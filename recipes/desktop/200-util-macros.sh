pkg=util-macros ver=1.20.2 src=util-macros-1.20.2.tar.xz
# The first of the X Window System: what its libraries and programs are built with.
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
