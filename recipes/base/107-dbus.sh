pkg=dbus ver=1.16.2 src=dbus-1.16.2.tar.xz
build() {
  mkdir build && cd build
  meson setup --prefix=/usr --buildtype=release --wrap-mode=nofallback ..
  ninja
  DESTDIR="$DEST" ninja install
  mkdir -p "$DEST/var/lib/dbus"
  ln -sf /etc/machine-id "$DEST/var/lib/dbus/machine-id"
}
