pkg=gtk3 ver=3.24.52 src=gtk-3.24.52.tar.xz
# GTK 3: the toolkit most Linux applications draw their windows with.
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D man=false -D broadway_backend=true -D wayland_backend=false -D introspection=false -D demos=false -D examples=false -D tests=false -D print_backends=file -D colord=no
  ninja
  DESTDIR="$DEST" ninja install
  # Settings every GTK application starts with.
  mkdir -p "$DEST/etc/gtk-3.0"
  printf '%s\n' '[Settings]' 'gtk-theme-name = Adwaita' 'gtk-icon-theme-name = Adwaita' 'gtk-font-name = DejaVu Sans 10' \
    'gtk-xft-antialias = 1' 'gtk-xft-hinting = 1' 'gtk-xft-hintstyle = hintslight' > "$DEST/etc/gtk-3.0/settings.ini"
}
