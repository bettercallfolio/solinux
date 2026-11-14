pkg=desktop-caches ver=0.1
build() {
  # Not a package of files from elsewhere: the lists that GTK, GLib and fontconfig read at
  # start-up, made once for everything installed so far.
  install -d "$DEST/usr/share/glib-2.0/schemas" "$DEST/usr/lib/gtk-3.0/3.0.0" "$DEST/usr/share/icons/Adwaita" "$DEST/usr/share/icons/hicolor" "$DEST/var/cache/fontconfig"
  glib-compile-schemas --targetdir="$DEST/usr/share/glib-2.0/schemas" /usr/share/glib-2.0/schemas
  gtk-query-immodules-3.0 > "$DEST/usr/lib/gtk-3.0/3.0.0/immodules.cache"
  gdk-pixbuf-query-loaders > "$DEST/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache" 2>/dev/null || { install -d "$DEST/usr/lib/gdk-pixbuf-2.0/2.10.0"; gdk-pixbuf-query-loaders > "$DEST/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache"; }
  for theme in Adwaita hicolor; do
    [ -d "/usr/share/icons/$theme" ] || continue
    gtk-update-icon-cache -q -f "/usr/share/icons/$theme"
    cp "/usr/share/icons/$theme/icon-theme.cache" "$DEST/usr/share/icons/$theme/"
  done
  fc-cache -f -s
  cp -a /var/cache/fontconfig/. "$DEST/var/cache/fontconfig/" 2>/dev/null || true
}
