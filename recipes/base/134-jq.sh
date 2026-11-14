pkg=jq ver=1.8.2 src=jq-1.8.2.tar.gz
build() {
  ./configure --prefix=/usr --disable-static --with-oniguruma=builtin --disable-docs
  make
  make DESTDIR="$DEST" install
}
