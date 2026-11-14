pkg=inetutils ver=2.8 src=inetutils-2.8.tar.gz
build() {
  sed -i 's/def HAVE_TERMCAP_TGETENT/ 1/' telnet/telnet.c
  ./configure --prefix=/usr --bindir=/usr/bin --localstatedir=/var --disable-logger --disable-whois \
    --disable-rcp --disable-rexec --disable-rlogin --disable-rsh --disable-servers
  make
  make DESTDIR="$DEST" install
  mkdir -p "$DEST/usr/sbin"
  mv "$DEST/usr/bin/ifconfig" "$DEST/usr/sbin/ifconfig"
}
