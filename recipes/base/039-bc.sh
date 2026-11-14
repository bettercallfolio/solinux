pkg=bc ver=7.0.3 src=bc-7.0.3.tar.xz
build() {
  CC='gcc -std=c99' ./configure --prefix=/usr -G -O3 -r
  make
  make DESTDIR="$DEST" install
}
