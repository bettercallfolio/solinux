pkg=libstdcxx ver=16.2.0 src=gcc-16.2.0.tar.xz
# The C++ standard library, built against the new C library.
build() {
  mkdir build && cd build
  ../libstdc++-v3/configure --host="$TARGET" --build="$(../config.guess)" CXX="$TARGET-gcc" \
    --prefix=/usr --disable-multilib --disable-nls --disable-libstdcxx-pch \
    --with-gxx-include-dir="/tools/$TARGET/include/c++/16.2.0"
  make
  make DESTDIR="$ROOT" install
  rm -f "${ROOT:?}"/usr/lib/lib{stdc++{,exp,fs},supc++}.la
}
