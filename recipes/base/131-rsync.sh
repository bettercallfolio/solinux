pkg=rsync ver=3.5.0 src=rsync-3.5.0.tar.gz
build() {
  ./configure --prefix=/usr --disable-xxhash --without-included-zlib
  make
  make DESTDIR="$DEST" install
}
