pkg=tmux ver=3.8 src=tmux-3.8.tar.gz
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
