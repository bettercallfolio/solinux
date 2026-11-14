pkg=grep ver=3.12 src=grep-3.12.tar.xz
build() {
  sed -i "s/echo/#echo/" src/egrep.sh
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
