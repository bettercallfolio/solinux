pkg=systemd ver=261.2 src=systemd-261.2.tar.gz
# The first process of a booted system: services, devices, network, names, time, logs,
# and the boot loader for disks.
build() {
  sed -e 's/GROUP="render"/GROUP="video"/' -e 's/GROUP="sgx", //' -i rules.d/50-udev-default.rules.in
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D default-dnssec=no -D firstboot=false \
    -D install-tests=false -D ldconfig=false -D sysusers=false -D rpmmacrosdir=no -D homed=disabled \
    -D man=disabled -D mode=release -D pamconfdir=no -D dev-kvm-mode=0660 -D nobody-group=nogroup \
    -D sysupdate=disabled -D ukify=disabled -D bootloader=enabled \
    -D sbat-distro=solinux -D sbat-distro-summary=Solinux -D sbat-distro-pkgname=systemd-boot \
    -D sbat-distro-version=261.2 -D sbat-distro-url=https://chainboot.dev
  ninja
  DESTDIR="$DEST" ninja install
  mkdir -p "$DEST/usr/share/man"
  tar -xf "$S/systemd-man-pages-261.2.tar.xz" --no-same-owner --strip-components=1 -C "$DEST/usr/share/man"
  # Which services start by default is decided by the presets that come with systemd.
  ./systemctl --root="$DEST" preset-all
  # An empty machine id: every system makes its own the first time it boots.
  : > "$DEST/etc/machine-id"
}
