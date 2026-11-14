pkg=binutils ver=2.47 src=binutils-2.47.tar.xz
build() {
  mkdir build && cd build
  ../configure --prefix=/usr --sysconfdir=/etc --enable-ld=default --enable-plugins --enable-shared \
    --disable-werror --enable-64-bit-bfd --enable-new-dtags --with-system-zlib \
    --with-lib-path=/usr/lib --enable-default-hash-style=gnu
  make tooldir=/usr
  make tooldir=/usr DESTDIR="$DEST" install
  rm -f "${DEST:?}"/usr/lib/lib{bfd,ctf,ctf-nobfd,gprofng,opcodes,sframe}.a
}
