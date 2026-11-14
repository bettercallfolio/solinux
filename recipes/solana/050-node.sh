pkg=node ver=24.19.0 src=node-v24.19.0.tar.xz
# Node.js with npm: Solana's JavaScript libraries, Anchor's tests, chainboot and the desk run on it.
build() {
  ./configure --prefix=/usr --shared-openssl --shared-zlib --shared-nghttp2
  make
  make DESTDIR="$DEST" install
}
