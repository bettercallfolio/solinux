pkg=diffutils ver=3.12 src=diffutils-3.12.tar.xz
build() {
  ./configure --prefix=/usr --host="$TARGET" gl_cv_func_strcasecmp_works=yes --build="$(./build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
