pkg=tar ver=1.35 src=tar-1.35.tar.xz
build() {
  patch -Np1 -i "$S/tar-1.35-acl_fix-1.patch"
  FORCE_UNSAFE_CONFIGURE=1 ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
