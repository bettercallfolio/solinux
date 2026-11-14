pkg=git ver=2.55.0 src=git-2.55.0.tar.xz
build() {
  ./configure --prefix=/usr --with-gitconfig=/etc/gitconfig --with-python=python3 --with-libpcre2
  # NO_RUST: git's parts written in Rust are optional, and the base system is built before Rust is.
  make NO_TCLTK=1 NO_RUST=1
  make NO_TCLTK=1 NO_RUST=1 perllibdir=/usr/lib/perl5/5.44/site_perl DESTDIR="$DEST" install
  mkdir -p "$DEST/usr/share/man"
  tar -xf "$S/git-manpages-2.55.0.tar.xz" -C "$DEST/usr/share/man" --no-same-owner --no-overwrite-dir
}
