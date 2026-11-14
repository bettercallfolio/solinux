pkg=shadow ver=4.20.2 src=shadow-4.20.2.tar.xz
# Users, groups and passwords.
build() {
  find man -name Makefile.in -exec sed -i 's/getspnam\.3 / /' {} \;
  find man -name Makefile.in -exec sed -i 's/passwd\.5 / /' {} \;
  sed -e 's:#ENCRYPT_METHOD SHA512:ENCRYPT_METHOD YESCRYPT:' -e 's:/var/spool/mail:/var/mail:' \
      -e '/PATH=/{s@/sbin:@@;s@/bin:@@}' -i etc/login.defs
  touch /usr/bin/passwd
  ./configure --sysconfdir=/etc --disable-static --with-{b,yes}crypt --without-libbsd \
    --disable-logind --with-group-name-max-length=32
  make
  make exec_prefix=/usr DESTDIR="$DEST" install
  make -C man DESTDIR="$DEST" install-man
  mkdir -p "$DEST/etc/default"
  cat > "$DEST/etc/default/useradd" <<'X'
GROUP=999
HOME=/home
INACTIVE=-1
EXPIRE=
SHELL=/bin/bash
SKEL=/etc/skel
CREATE_MAIL_SPOOL=no
X
  touch "$DEST/etc/subuid" "$DEST/etc/subgid"
}
