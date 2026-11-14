pkg=libxcrypt ver=4.5.2 src=libxcrypt-4.5.2.tar.xz
build() {
  sed -i '/strchr/s/const//' lib/crypt-{sm3,gost}-yescrypt.c
  ./configure --prefix=/usr --enable-hashes=strong,glibc --enable-obsolete-api=no --disable-static --disable-failure-tokens
  make
  make DESTDIR="$DEST" install
}
