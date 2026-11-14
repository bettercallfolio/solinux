pkg=pcre2 ver=10.47 src=pcre2-10.47.tar.bz2
build() {
  ./configure --prefix=/usr --enable-unicode --enable-jit --enable-pcre2-16 --enable-pcre2-32 \
    --enable-pcre2grep-libz --enable-pcre2grep-libbz2 --enable-pcre2test-libreadline --disable-static
  make
  make DESTDIR="$DEST" install
}
