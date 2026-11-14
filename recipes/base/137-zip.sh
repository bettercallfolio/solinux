pkg=zip ver=3.0 src=zip30.tar.gz
build() {
  make -f unix/Makefile generic CC="gcc -std=gnu89"
  make prefix="$DEST/usr" MANDIR="$DEST/usr/share/man/man1" -f unix/Makefile install
}
