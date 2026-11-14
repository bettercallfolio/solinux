pkg=python ver=3.14.7 src=Python-3.14.7.tar.xz
build() {
  patch -Np1 -i "$S/Python-3.14.7-openssl_4-1.patch"
  ./configure --prefix=/usr --enable-shared --with-system-expat --without-static-libpython
  make
  make DESTDIR="$DEST" install
  mkdir -p "$DEST/etc"
  cat > "$DEST/etc/pip.conf" <<'X'
[global]
root-user-action = ignore
disable-pip-version-check = true
X
  ln -sf python3 "$DEST/usr/bin/python"
  # Python's own test suite and its Tk programs (there is no Tk here) are not part of the system.
  local lib="${DEST:?}/usr/lib/python3.14"
  rm -rf "$lib/test" "$lib/idlelib" "$lib/turtledemo" "$lib/tkinter" "$lib"/config-3.14-*/libpython3.14.a
}
