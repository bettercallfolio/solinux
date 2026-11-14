pkg=libxcb ver=1.17.0 src=libxcb-1.17.0.tar.xz
build() {
  export LC_ALL=en_US.UTF-8
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static --without-doxygen
  make
  make DESTDIR="$DEST" install
}
