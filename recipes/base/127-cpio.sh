pkg=cpio ver=2.15 src=cpio-2.15.tar.bz2
build() {
  sed -e "/^extern int (\*xstat)/s/()/(const char * restrict,  struct stat * restrict)/" -i src/extern.h
  sed -e "/^int (\*xstat)/s/()/(const char * restrict,  struct stat * restrict)/" -i src/global.c
  ./configure --prefix=/usr --enable-mt --with-rmt=/usr/libexec/rmt
  make
  make DESTDIR="$DEST" install
}
