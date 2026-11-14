pkg=lua ver=5.4.8 src=lua-5.4.8.tar.gz
# Lua: a small, fast scripting language.
build() {
  patch -Np1 -i "$S/lua-5.4.8-shared_library-1.patch"
  make linux
  make INSTALL_TOP="$DEST/usr" INSTALL_DATA="cp -d" INSTALL_MAN="$DEST/usr/share/man/man1" \
    TO_LIB="liblua.so liblua.so.5.4 liblua.so.5.4.8" install
  install -d "$DEST/usr/lib/pkgconfig"
  printf '%s\n' 'prefix=/usr' 'libdir=${prefix}/lib' 'includedir=${prefix}/include' '' 'Name: Lua' \
    'Description: An Extensible Extension Language' 'Version: 5.4.8' 'Libs: -L${libdir} -llua -lm -ldl' \
    'Cflags: -I${includedir}' > "$DEST/usr/lib/pkgconfig/lua.pc"
}
