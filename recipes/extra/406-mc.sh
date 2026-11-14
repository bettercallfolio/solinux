pkg=mc ver=4.8.33 src=mc-4.8.33.tar.xz
# Midnight Commander: a two-pane file manager for the terminal.
build() {
  ./configure --prefix=/usr --sysconfdir=/etc --enable-charset --with-screen=ncurses
  make
  make DESTDIR="$DEST" install
}
