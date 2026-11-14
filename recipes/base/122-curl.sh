pkg=curl ver=8.21.0 src=curl-8.21.0.tar.xz
build() {
  ./configure --prefix=/usr --disable-static --with-openssl --with-nghttp2 --without-libpsl \
    --with-ca-bundle=/etc/ssl/certs/ca-certificates.crt
  make
  make DESTDIR="$DEST" install
}
