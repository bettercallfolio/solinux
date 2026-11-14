pkg=ncurses ver=6.6 src=ncurses-6.6.tar.gz
build() {
  ./configure --prefix=/usr --mandir=/usr/share/man --with-shared --without-debug --without-normal \
    --with-cxx-shared --enable-pc-files --with-pkg-config-libdir=/usr/lib/pkgconfig
  make
  make DESTDIR="$DEST" install
  sed -e 's/^#if.*XOPEN.*$/#if 1/' -i "$DEST/usr/include/curses.h"
  local lib
  for lib in ncurses form panel menu; do
    ln -sf "lib${lib}w.so" "$DEST/usr/lib/lib${lib}.so"
    ln -sf "${lib}w.pc" "$DEST/usr/lib/pkgconfig/${lib}.pc"
  done
  ln -sf libncursesw.so "$DEST/usr/lib/libcurses.so"
  # Names that programs built elsewhere ask for.
  ln -sf libncursesw.so.6 "$DEST/usr/lib/libncurses.so.6"
  ln -sf libncursesw.so.6 "$DEST/usr/lib/libtinfo.so.6"
  ln -sf libncursesw.so "$DEST/usr/lib/libtinfo.so"
}
