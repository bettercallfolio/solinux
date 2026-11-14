pkg=dosfstools ver=4.2 src=dosfstools-4.2.tar.gz
build() {
  ./configure --prefix=/usr --enable-compat-symlinks --mandir=/usr/share/man
  make
  make DESTDIR="$DEST" install
}
