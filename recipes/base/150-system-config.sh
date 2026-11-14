pkg=system-config ver=0.1
# How a Solinux system behaves when it boots: network, names, console, limits.
build() {
  mkdir -p "$DEST"/etc/systemd/{network,system,system.conf.d} "$DEST"/etc/sysctl.d

  # Every wired network card asks the network for an address.
  cat > "$DEST/etc/systemd/network/80-wired.network" <<'X'
[Match]
Name=en* eth*

[Network]
DHCP=yes
IPv6AcceptRA=yes

[DHCPv4]
UseDomains=true
X
  # Do not hold the boot back until the network is up.
  ln -s /dev/null "$DEST/etc/systemd/system/systemd-networkd-wait-online.service"
  ln -s ../run/systemd/resolve/stub-resolv.conf "$DEST/etc/resolv.conf"

  # The same settings the kernel carries, for systems that run on another kernel
  # (a chainboot machine uses the kernel of the computer it runs on).
  cat > "$DEST/etc/sysctl.d/50-solana.conf" <<'X'
vm.max_map_count = 1000000
fs.nr_open = 1000000
net.core.rmem_max = 134217728
net.core.rmem_default = 134217728
net.core.wmem_max = 134217728
net.core.wmem_default = 134217728
X
  cat > "$DEST/etc/systemd/system.conf.d/50-solana.conf" <<'X'
[Manager]
DefaultLimitNOFILE=1000000
X

  echo 'LANG=en_US.UTF-8' > "$DEST/etc/locale.conf"
  cat > "$DEST/etc/fstab" <<'X'
# file system  mount point  type  options  dump  pass
X
  printf 'Solinux 0.1 (\\l)\n\n' > "$DEST/etc/issue"

  # The console of a booted system opens as root, like a live system. Nothing listens on the
  # network until it is turned on, and root has no password (so nobody can log in as root
  # from anywhere else).
  local unit
  for unit in getty@tty1 serial-getty@ttyS0; do
    mkdir -p "$DEST/etc/systemd/system/$unit.service.d"
    cat > "$DEST/etc/systemd/system/$unit.service.d/autologin.conf" <<'X'
[Service]
ExecStart=
ExecStart=-/usr/sbin/agetty --autologin root --noclear --keep-baud 115200,57600,38400,9600 %I $TERM
TTYVTDisallocate=no
X
  done
  sed -i 's/--keep-baud 115200,57600,38400,9600 //' "$DEST/etc/systemd/system/getty@tty1.service.d/autologin.conf"

  # Passwords: every account locked.
  awk -F: '{ print $1 ":*:20000:0:99999:7:::" }' /etc/passwd > "$DEST/etc/shadow"
  awk -F: '{ print $1 ":!::" }' /etc/group > "$DEST/etc/gshadow"
  chmod 600 "$DEST/etc/shadow" "$DEST/etc/gshadow"
}
