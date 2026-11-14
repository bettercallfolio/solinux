pkg=openssl ver=4.0.1 src=openssl-4.0.1.tar.gz
build() {
  ./config --prefix=/usr --openssldir=/etc/ssl --libdir=lib shared zlib-dynamic
  make
  make DESTDIR="$DEST" INSTALL_LIBS= MANSUFFIX=ssl install
}
