pkg=gcc ver=16.2.0 src=gcc-16.2.0.tar.xz
# The compiler again, as a program of the new system: from here on the system can build itself.
build() {
  for d in mpfr-4.2.2 gmp-6.3.0 mpc-1.4.1; do
    tar -xf "$S/$d.tar.xz"; mv "$d" "${d%%-*}"
  done
  sed -e '/m64=/s/lib64/lib/' -i.orig gcc/config/i386/t-linux64
  mkdir build && cd build
  ../configure --build="$(../config.guess)" --host="$TARGET" --target="$TARGET" --prefix=/usr \
    --with-build-sysroot="$ROOT" --enable-default-pie --enable-default-ssp --disable-fixincludes \
    --disable-nls --disable-multilib --disable-libatomic --disable-libgomp --disable-libquadmath \
    --disable-libsanitizer --disable-libssp --disable-libvtv --enable-languages=c,c++ \
    CXX_FOR_TARGET="$TARGET-gcc -nostdinc++" LDFLAGS_FOR_TARGET="-L$PWD/$TARGET/libgcc" \
    target_configargs=gcc_cv_target_thread_file=posix
  make
  make DESTDIR="$ROOT" install
  ln -sf gcc "$ROOT/usr/bin/cc"
}
