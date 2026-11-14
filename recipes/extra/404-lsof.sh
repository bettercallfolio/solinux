pkg=lsof ver=4.99.7 src=lsof-4.99.7.tar.gz
# lsof: which files and network ports every program has open.
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
