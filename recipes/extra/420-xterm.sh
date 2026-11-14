pkg=xterm ver=411 src=xterm-411.tgz
# XTerm: the classic terminal of the X Window System.
build() {
  sed -i '/v0/{n;s/new:/new:kb=^?:/}' termcap
  printf '\tkbs=\\177,\n' >> terminfo
  TERMINFO=/usr/share/terminfo ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static \
    --with-app-defaults=/etc/X11/app-defaults
  make
  make DESTDIR="$DEST" install
  install -d "$DEST/usr/share/applications"
  cp xterm.desktop "$DEST/usr/share/applications/"
}
