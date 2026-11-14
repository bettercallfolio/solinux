pkg=flex ver=2.6.4 src=flex-2.6.4.tar.gz
build() {
  ./configure --prefix=/usr --disable-static
  make
  make DESTDIR="$DEST" install
  ln -s flex "$DEST/usr/bin/lex"
  ln -s flex.1 "$DEST/usr/share/man/man1/lex.1"
}
