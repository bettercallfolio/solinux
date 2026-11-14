pkg=bash ver=5.3 src=bash-5.3.tar.gz
build() {
  ./configure --prefix=/usr --without-bash-malloc --with-installed-readline
  make
  make DESTDIR="$DEST" install
  ln -sf bash "$DEST/usr/bin/sh"
}
