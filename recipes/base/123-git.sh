pkg=git ver=2.55.0 src=git-2.55.0.tar.xz
build() {
  ./configure --prefix=/usr --with-gitconfig=/etc/gitconfig --with-python=python3 --with-libpcre2
  make NO_TCLTK=1
  make NO_TCLTK=1 perllibdir=/usr/lib/perl5/5.44/site_perl DESTDIR="$DEST" install
  mkdir -p "$DEST/usr/share/man"
  tar -xf "$S/git-manpages-2.55.0.tar.xz" -C "$DEST/usr/share/man" --no-same-owner --no-overwrite-dir
}
