pkg=kbd ver=2.10.0 src=kbd-2.10.0.tar.xz
build() {
  patch -Np1 -i "$S/kbd-2.10.0-backspace-1.patch"
  sed -i '/RESIZECONS_PROGS=/s/yes/no/' configure
  sed -i 's/resizecons.8 //' docs/man/man8/Makefile.in
  ./configure --prefix=/usr --disable-vlock
  make
  make DESTDIR="$DEST" install
}
