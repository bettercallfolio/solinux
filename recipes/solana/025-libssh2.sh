pkg=libssh2 ver=1.11.1 src=libssh2-1.11.1.tar.gz
# cargo fetches over SSH with it. Built here so that cargo uses this one (which knows
# OpenSSL 4) instead of compiling its own copy.
build() {
  patch -Np1 -i "$S/libssh2-1.11.1-security_fixes-1.patch"
  ./configure --prefix=/usr --disable-docker-tests --disable-static
  make
  make DESTDIR="$DEST" install
}
