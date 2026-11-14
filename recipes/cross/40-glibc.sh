pkg=glibc ver=2.44 src=glibc-2.44.tar.xz
# The C library, cross-compiled into the new system.
build() {
  ln -sf ../lib/ld-linux-x86-64.so.2 "$ROOT/lib64"
  ln -sf ../lib/ld-linux-x86-64.so.2 "$ROOT/lib64/ld-lsb-x86-64.so.3"
  patch -Np1 -i "$S/glibc-fhs-1.patch"
  patch -Np1 -i "$S/glibc-2.44-upstream_fixes-1.patch"
  mkdir build && cd build
  echo "rootsbindir=/usr/sbin" > configparms
  ../configure --prefix=/usr --host="$TARGET" --build="$(../scripts/config.guess)" \
    --disable-nscd libc_cv_slibdir=/usr/lib --enable-kernel=5.10
  make
  make DESTDIR="$ROOT" install
  sed '/RTLDLIST=/s@/usr@@g' -i "$ROOT/usr/bin/ldd"
  # The new compiler must now find the new library and nothing of the host's.
  echo 'int main(){}' | "$TARGET-gcc" -x c - -v -Wl,--verbose > dummy.log 2>&1
  "$TARGET-readelf" -l a.out | grep -q ': /lib64/ld-linux-x86-64.so.2'
  grep -q "$ROOT/usr/lib/libc.so.6 succeeded" dummy.log
}
