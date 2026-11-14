pkg=screen ver=5.0.2 src=screen-5.0.2.tar.gz
# Screen: several terminals in one, which keep running when you leave.
build() {
  ./configure --prefix=/usr --infodir=/usr/share/info --mandir=/usr/share/man --disable-pam \
    --enable-socket-dir=/run/screen --with-pty-group=5 --with-system_screenrc=/etc/screenrc
  sed -i -e "s%/usr/local/etc/screenrc%/etc/screenrc%" {etc,doc}/*
  make
  make DESTDIR="$DEST" install
  install -Dm644 etc/etcscreenrc "$DEST/etc/screenrc"
}
