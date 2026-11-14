pkg=acl ver=2.4.0 src=acl-2.4.0.tar.xz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
}
