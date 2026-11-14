pkg=firefox ver=153.2.0esr src=firefox-153.2.0esr.source.tar.xz
# Firefox, built from Mozilla's source without its official branding (a distribution's own build).
build() {
  cat > mozconfig <<'X'
  ac_add_options --prefix=/usr
  ac_add_options --enable-application=browser
  ac_add_options --enable-default-toolkit=cairo-gtk3-x11-only
  ac_add_options --disable-crashreporter
  ac_add_options --disable-updater
  ac_add_options --disable-tests
  ac_add_options --disable-debug-symbols
  ac_add_options --disable-necko-wifi
  ac_add_options --enable-audio-backends=alsa
  ac_add_options --without-wasm-sandboxed-libraries
  ac_add_options --enable-system-ffi
  ac_add_options --enable-system-pixman
  ac_add_options --with-system-jpeg
  ac_add_options --with-system-zlib
  unset MOZ_TELEMETRY_REPORTING
  mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj
  MOZ_APP_REMOTINGNAME=firefox
  X
  export MACH_BUILD_PYTHON_NATIVE_PACKAGE_SOURCE=none MOZBUILD_STATE_PATH=$PWD/mozbuild SHELL=/bin/bash
  ./mach build
  DESTDIR="$DEST" ./mach install
  install -d "$DEST/usr/share/applications" "$DEST/usr/share/pixmaps"
  printf '%s\n' '[Desktop Entry]' 'Name=Firefox' 'GenericName=Web Browser' 'Comment=Browse the web' 'Exec=firefox %u' 'Terminal=false' \
    'Type=Application' 'Icon=firefox' 'Categories=Network;WebBrowser;' 'StartupWMClass=firefox' > "$DEST/usr/share/applications/firefox.desktop"
  ln -s /usr/lib/firefox/browser/chrome/icons/default/default128.png "$DEST/usr/share/pixmaps/firefox.png"
}
