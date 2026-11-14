pkg=linux-pam ver=1.7.2 src=Linux-PAM-1.7.2.tar.xz
# The display server's build asks for this library. Nothing in the system signs anyone in through it: its one rule refuses every request.
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D docs=disabled -D examples=false -D xtests=false -D selinux=disabled -D audit=disabled -D nis=disabled -D logind=disabled -D elogind=disabled -D econf=disabled -D pam_userdb=disabled
  ninja
  DESTDIR="$DEST" ninja install
  install -d "$DEST/etc/pam.d"
  printf '%s required pam_deny.so\n' auth account password session > "$DEST/etc/pam.d/other"
}
