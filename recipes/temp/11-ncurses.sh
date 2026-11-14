pkg=ncurses ver=6.6 src=ncurses-6.6.tar.gz
build() {
  mkdir build
  ( cd build && ../configure --prefix="$ROOT/tools" AWK=gawk && make -C include && make -C progs tic && install progs/tic "$ROOT/tools/bin" )
  ./configure --prefix=/usr --host="$TARGET" --build="$(./config.guess)" --mandir=/usr/share/man \
    --with-manpage-format=normal --with-shared --without-normal --with-cxx-shared \
    --without-debug --without-ada --disable-stripping AWK=gawk
  make
  make DESTDIR="$ROOT" install
  ln -sf libncursesw.so "$ROOT/usr/lib/libncurses.so"
  sed -e 's/^#if.*XOPEN.*$/#if 1/' -i "$ROOT/usr/include/curses.h"
}
