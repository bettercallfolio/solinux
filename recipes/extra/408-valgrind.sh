pkg=valgrind ver=3.27.1 src=valgrind-3.27.1.tar.bz2
# Valgrind: finds memory errors and leaks in programs, and profiles them.
build() {
  sed -i 's|/doc/valgrind||' docs/Makefile.in
  ./configure --prefix=/usr --datadir=/usr/share/doc/valgrind-3.27.1
  make
  make DESTDIR="$DEST" install
}
