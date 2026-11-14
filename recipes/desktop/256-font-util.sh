pkg=font-util ver=1.4.1 src=font-util-1.4.1.tar.xz
# Build macros for fonts; the display server's build asks for them.
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static
  make
  make DESTDIR="$DEST" install
}
