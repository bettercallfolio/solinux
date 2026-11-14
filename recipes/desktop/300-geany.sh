pkg=geany ver=2.1 src=geany-2.1.tar.bz2
# Geany: a small, fast editor and development environment.
build() {
  ./configure --prefix=/usr --disable-html-docs --disable-pdf-docs --disable-api-docs
  make
  make DESTDIR="$DEST" install
}
