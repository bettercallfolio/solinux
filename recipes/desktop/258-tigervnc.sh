pkg=tigervnc ver=1.16.2 src=tigervnc-1.16.2.tar.gz
# The display server.
build() {
  # Only the server (Xvnc) is built: an X display without a screen, whose picture goes out over
  # the VNC protocol. The desktop gives every graphical application one of these.
  patch -Np1 -i "$S/tigervnc-1.16.2-configuration_fixes-1.patch"
  grep -rl _digest | xargs sed -Ei '/digest/s/([^,]*),.*,(.*)/\1,\2/'
  grep -rl _DIGEST | xargs sed -i '/DIGEST/s/, 16//'
  mkdir -p unix/xserver
  tar -xf "$S/xorg-server-21.1.24.tar.xz" --strip-components=1 -C unix/xserver
  ( cd unix/xserver
    patch -Np1 -i ../xserver21.patch
    sed -e '/sha.h/s/sha/sha1/' -e '/sha1/a #include <nettle/version.h>' -e 's/ctx, 20/ctx/' -i os/xsha1.c )
  cmake -G "Unix Makefiles" -D CMAKE_INSTALL_PREFIX=/usr -D CMAKE_BUILD_TYPE=Release -D BUILD_VIEWER=OFF \
    -D ENABLE_NLS=OFF -D ENABLE_GNUTLS=OFF -D ENABLE_PAM=OFF -W no-author .
  make
  cd unix/xserver
  autoreconf -fiv
  ./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static \
    --disable-xorg --disable-xnest --disable-xvfb --disable-xwin --disable-xephyr --disable-kdrive \
    --disable-devel-docs --disable-config-hal --disable-config-udev --disable-unit-tests --disable-selective-werror \
    --disable-dri --disable-dri2 --disable-dri3 --disable-glx --disable-glamor --disable-secure-rpc --disable-xdmcp \
    --without-dtrace --with-pic --with-xkb-path=/usr/share/X11/xkb --with-xkb-bin-directory=/usr/bin
  make
  make -C hw/vnc DESTDIR="$DEST" install
}
