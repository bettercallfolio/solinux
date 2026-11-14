pkg=libcap ver=2.78 src=libcap-2.78.tar.xz
build() {
  sed -i '/install -m.*STA/d' libcap/Makefile
  make prefix=/usr lib=lib
  make prefix=/usr lib=lib DESTDIR="$DEST" install
}
