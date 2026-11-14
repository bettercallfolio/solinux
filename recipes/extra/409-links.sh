pkg=links ver=2.30 src=links-2.30.tar.bz2
# Links: a web browser for the terminal.
build() {
  sed '/*strchr/s/cast_const_char //g' -i ftp.c
  ./configure --prefix=/usr --mandir=/usr/share/man
  make
  make DESTDIR="$DEST" install
}
