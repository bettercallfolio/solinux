pkg=bash ver=5.3 src=bash-5.3.tar.gz
build() {
  ./configure --prefix=/usr --build="$(sh support/config.guess)" --host="$TARGET" --without-bash-malloc
  make
  make DESTDIR="$ROOT" install
  ln -sf bash "$ROOT/bin/sh"
}
