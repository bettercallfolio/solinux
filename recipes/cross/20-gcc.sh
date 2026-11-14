pkg=gcc ver=16.2.0 src=gcc-16.2.0.tar.xz
# A first C compiler for the new system, without a C library to lean on yet.
build() {
  for d in mpfr-4.2.2 gmp-6.3.0 mpc-1.4.1; do
    tar -xf "$S/$d.tar.xz"; mv "$d" "${d%%-*}"
  done
  sed -e '/m64=/s/lib64/lib/' -i.orig gcc/config/i386/t-linux64
  mkdir build && cd build
  ../configure --target="$TARGET" --prefix="$ROOT/tools" --with-glibc-version=2.44 \
    --with-sysroot="$ROOT" --with-newlib --without-headers \
    --enable-default-pie --enable-default-ssp --disable-fixincludes --disable-nls \
    --disable-shared --disable-multilib --disable-threads --disable-libatomic \
    --disable-libgomp --disable-libquadmath --disable-libssp --disable-libvtv \
    --disable-libstdcxx --enable-languages=c,c++
  make
  make install
  cd ..
  cat gcc/limitx.h gcc/glimits.h gcc/limity.h > "$("$TARGET-gcc" -print-file-name=include)/limits.h"
}
