pkg=joe ver=4.6 src=joe-4.6.tar.gz
# JOE: an easy editor for the terminal, with the keys of WordStar, Emacs or Pico.
build() {
  ./configure --prefix=/usr --sysconfdir=/etc
  make
  make DESTDIR="$DEST" install
}
