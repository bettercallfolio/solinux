pkg=emacs ver=31.1 src=emacs-31.1.tar.xz
# GNU Emacs: the extensible editor, with its window.
build() {
  ./configure --prefix=/usr --with-x-toolkit=gtk3 --with-gnutls=ifavailable --with-gif=ifavailable \
    --with-tiff=ifavailable --with-xpm=ifavailable --without-native-compilation --with-tree-sitter=ifavailable
  make
  make DESTDIR="$DEST" install
}
