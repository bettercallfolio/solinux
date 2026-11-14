pkg=feh ver=3.12.4 src=feh-3.12.4.tar.bz2
# feh: a fast picture viewer.
build() {
  make PREFIX=/usr exif=0 verscmp=0
  make PREFIX=/usr DESTDIR="$DEST" install
}
