pkg=sudo ver=1.9.17p2 src=sudo-1.9.17p2.tar.gz
build() {
  sed -e 's/\([->.a-zA-Z_]*\)->length/ASN1_STRING_length(\1)/' -i lib/iolog/hostcheck.c
  ./configure --prefix=/usr --libexecdir=/usr/lib --with-secure-path --with-env-editor \
    --with-passprompt="[sudo] password for %p: "
  make
  make DESTDIR="$DEST" install
  cat > "$DEST/etc/sudoers.d/00-sudo" <<'X'
Defaults secure_path="/usr/sbin:/usr/bin"
%wheel ALL=(ALL) ALL
X
  chmod 440 "$DEST/etc/sudoers.d/00-sudo"
}
