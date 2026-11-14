pkg=man-pages ver=6.18 src=man-pages-6.18.tar.xz
build() {
  rm -f man3/crypt*
  make -R GIT=false prefix=/usr DESTDIR="$DEST" install
}
