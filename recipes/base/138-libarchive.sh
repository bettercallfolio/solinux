pkg=libarchive ver=3.8.9 src=libarchive-3.8.9.tar.xz
# Reads and writes archives of every common kind. Its bsdunzip is this system's unzip.
build() {
  ./configure --prefix=/usr --disable-static --without-expat
  make
  make DESTDIR="$DEST" install
  ln -s bsdunzip "$DEST/usr/bin/unzip"
}
