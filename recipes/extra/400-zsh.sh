pkg=zsh ver=5.9.2 src=zsh-5.9.2.tar.xz
# Zsh: a shell with strong completion and scripting.
build() {
  ./configure --prefix=/usr --sysconfdir=/etc/zsh --enable-etcdir=/etc/zsh --enable-cap --enable-gdbm --enable-pcre
  make
  make DESTDIR="$DEST" install
}
