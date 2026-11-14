pkg=gcc ver=16.2.0 src=gcc-16.2.0.tar.xz
# The compiler, built for the third and last time: by itself, against the final libraries.
build() {
  sed -e '/m64=/s/lib64/lib/' -i.orig gcc/config/i386/t-linux64
  mkdir build && cd build
  ../configure --prefix=/usr LD=ld --enable-languages=c,c++ --enable-default-pie --enable-default-ssp \
    --enable-host-pie --disable-multilib --disable-bootstrap --disable-fixincludes --with-system-zlib
  make
  make DESTDIR="$DEST" install
  ln -s ../bin/cpp "$DEST/usr/lib/cpp"
  ln -s gcc "$DEST/usr/bin/cc"
  ln -s gcc.1 "$DEST/usr/share/man/man1/cc.1"
  local plugin; plugin=$(cd "$DEST" && find usr/libexec -name liblto_plugin.so | head -n1)
  mkdir -p "$DEST/usr/lib/bfd-plugins"
  ln -s "../../${plugin#usr/}" "$DEST/usr/lib/bfd-plugins/liblto_plugin.so"
  mkdir -p "$DEST/usr/share/gdb/auto-load/usr/lib"
  mv "$DEST"/usr/lib/*gdb.py "$DEST/usr/share/gdb/auto-load/usr/lib"
}
