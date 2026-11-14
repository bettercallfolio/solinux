pkg=alsa-lib ver=1.2.16.1 src=alsa-lib-1.2.16.1.tar.bz2
# The sound library Firefox is built against.
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
