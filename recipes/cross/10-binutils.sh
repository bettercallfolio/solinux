pkg=binutils ver=2.47 src=binutils-2.47.tar.xz
# Assembler and linker that run on the host and produce programs for the new system.
build() {
  mkdir build && cd build
  ../configure --prefix="$ROOT/tools" --with-sysroot="$ROOT" --target="$TARGET" \
    --disable-nls --enable-gprofng=no --disable-werror --enable-new-dtags \
    --enable-default-hash-style=gnu
  make
  make install
}
