pkg=gmp ver=6.3.0 src=gmp-6.3.0.tar.xz
build() {
  sed -i '/long long t1;/,+1s/()/(...)/' configure
  # --build: code for any x86-64 processor, not only the one this was built on.
  ./configure --prefix=/usr --enable-cxx --disable-static --build=x86_64-pc-linux-gnu
  make
  make DESTDIR="$DEST" install
}
