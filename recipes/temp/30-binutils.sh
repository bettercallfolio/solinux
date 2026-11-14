pkg=binutils ver=2.47 src=binutils-2.47.tar.xz
# Assembler and linker again, this time as programs of the new system itself.
build() {
  sed '6031s/$add_dir//' -i ltmain.sh
  mkdir build && cd build
  ../configure --prefix=/usr --build="$(../config.guess)" --host="$TARGET" --disable-nls \
    --enable-shared --enable-gprofng=no --disable-werror --enable-64-bit-bfd \
    --enable-new-dtags --enable-default-hash-style=gnu
  make
  make DESTDIR="$ROOT" install
  rm -f "${ROOT:?}"/usr/lib/lib{bfd,ctf,ctf-nobfd,opcodes,sframe}.{a,la}
}
