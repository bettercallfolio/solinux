pkg=nasm ver=3.02 src=nasm-3.02.tar.xz
# An assembler: Firefox's video decoders are built with it.
build() {
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
}
