pkg=desk ver=0.1.0
# The Solinux desktop: the server, the page a browser shows, and its two small helpers
# (one gives a terminal to a command, one arranges the windows of a graphical application).
build() {
  install -d "$DEST/usr/lib/solinux/desk/bin" "$DEST/usr/bin" "$DEST/usr/lib/systemd/system" "$DEST/etc/profile.d" "$DEST/etc/solinux" \
    "$DEST/etc/systemd/system/multi-user.target.wants"
  cp -r "$REPO/desk/server" "$REPO/desk/web" "$REPO/desk/package.json" "$DEST/usr/lib/solinux/desk/"
  gcc -O2 -o "$DEST/usr/lib/solinux/desk/bin/solinux-pty" "$REPO/desk/pty/solinux-pty.c" -lutil
  gcc -O2 -o "$DEST/usr/lib/solinux/desk/bin/solinux-wm" "$REPO/desk/wm/solinux-wm.c" -lX11
  install -m755 "$REPO/desk/system/solinux-desk" "$DEST/usr/bin/solinux-desk"
  install -m644 "$REPO/desk/system/desk.conf" "$DEST/etc/solinux/desk.conf"
  install -m644 "$REPO/desk/system/profile.sh" "$DEST/etc/profile.d/solinux-desk.sh"
  install -Dm755 "$REPO/desk/system/chainboot-start" "$DEST/etc/chainboot/start"
  install -m644 "$REPO/desk/system/solinux-desk.service" "$DEST/usr/lib/systemd/system/solinux-desk.service"
  # How Firefox behaves on this desktop: no first-run pages or telemetry, Solana's pages as bookmarks.
  install -Dm644 "$REPO/desk/system/firefox-policies.json" "$DEST/etc/firefox/policies/policies.json"
  ln -s /usr/lib/systemd/system/solinux-desk.service "$DEST/etc/systemd/system/multi-user.target.wants/solinux-desk.service"
}
