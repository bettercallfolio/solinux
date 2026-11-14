#!/usr/bin/env python3
"""Writes the recipes of the "desktop" stage: the X libraries, fonts, GTK, the display
server that carries a window to the browser, and the first applications.

Most of these packages are built in one of three standard ways, so their recipes are
written from a table here instead of by hand. Run it again after changing the table:

    build/make-desktop-recipes.py

Versions follow Beyond Linux From Scratch 13.1.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "recipes", "desktop")
os.makedirs(OUT, exist_ok=True)

XORG = "--prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static"
count = 0


def write(number, pkg, ver, src, body, note=""):
    global count
    lines = [f"pkg={pkg} ver={ver}" + (f" src={src}" if src else "")]
    if note:
        lines += [f"# {l}" for l in note.split("\n")]
    lines += ["build() {"] + ["  " + l if l else "" for l in body.strip("\n").split("\n")] + ["}"]
    with open(os.path.join(OUT, f"{number:03d}-{pkg}.sh"), "w") as f:
        f.write("\n".join(lines) + "\n")
    count += 1


def autotools(number, pkg, ver, src, args="", note="", before="", after=""):
    body = (before + "\n" if before else "") + f"./configure {args}\nmake\nmake DESTDIR=\"$DEST\" install" + ("\n" + after if after else "")
    write(number, pkg, ver, src, body, note)


def meson(number, pkg, ver, src, args="", note="", before="", after=""):
    body = (before + "\n" if before else "") + f"mkdir build && cd build\nmeson setup .. --prefix=/usr --buildtype=release {args}".rstrip() + "\nninja\nDESTDIR=\"$DEST\" ninja install" + ("\n" + after if after else "")
    write(number, pkg, ver, src, body, note)


n = 200
# ---- the X protocol and its libraries
autotools(n, "util-macros", "1.20.2", "util-macros-1.20.2.tar.xz", XORG, "The first of the X Window System: what its libraries and programs are built with."); n += 1
meson(n, "xorgproto", "2025.1", "xorgproto-2025.1.tar.xz"); n += 1
autotools(n, "libXau", "1.0.12", "libXau-1.0.12.tar.xz", XORG); n += 1
autotools(n, "libXdmcp", "1.1.5", "libXdmcp-1.1.5.tar.xz", XORG); n += 1
autotools(n, "xcb-proto", "1.17.0", "xcb-proto-1.17.0.tar.xz", XORG, before="export PYTHON=python3"); n += 1
autotools(n, "libxcb", "1.17.0", "libxcb-1.17.0.tar.xz", XORG + " --without-doxygen", before="export LC_ALL=en_US.UTF-8"); n += 1

# ---- pictures and letters
autotools(n, "libpng", "1.6.58", "libpng-1.6.58.tar.xz", "--prefix=/usr --disable-static"); n += 1
meson(n, "glib", "2.88.3", "glib-2.88.3.tar.xz", "-D introspection=disabled -D glib_debug=disabled -D man-pages=disabled -D sysprof=disabled -D tests=false",
      "The library under GTK and most graphical programs."); n += 1
autotools(n, "freetype", "2.14.3", "freetype-2.14.3.tar.xz", "--prefix=/usr --disable-static --enable-freetype-config --with-harfbuzz=dynamic",
          before='sed -ri "s:.*(AUX_MODULES.*valid):\\1:" modules.cfg\nsed -r "s:.*(#.*SUBPIXEL_RENDERING) .*:\\1:" -i include/freetype/config/ftoption.h'); n += 1
meson(n, "harfbuzz", "14.3.1", "harfbuzz-14.3.1.tar.xz", "-D tests=disabled -D docs=disabled -D introspection=disabled"); n += 1
autotools(n, "fontconfig", "2.18.3", "fontconfig-2.18.3.tar.xz", "--prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-docs"); n += 1

# ---- the X libraries (Xorg's own group, in its order)
n = 220
for name, ver, how in [
    ("xtrans", "1.6.0", ""), ("libX11", "1.8.13", ""), ("libXext", "1.3.7", ""), ("libICE", "1.1.2", ""), ("libSM", "1.2.6", ""),
    ("libXt", "1.3.1", "--with-appdefaultdir=/etc/X11/app-defaults"), ("libXmu", "1.3.1", ""), ("libXpm", "3.5.19", "--disable-open-zfile"),
    ("libXaw", "1.0.16", ""), ("libXfixes", "6.0.2", ""), ("libXcomposite", "0.4.7", ""), ("libXrender", "0.9.12", ""), ("libXcursor", "1.2.3", ""),
    ("libXdamage", "1.1.7", ""), ("libfontenc", "1.1.9", ""), ("libXfont2", "2.0.9", "--disable-devel-docs"), ("libXft", "2.3.9", ""),
    ("libXi", "1.8.3", ""), ("libXinerama", "1.1.6", ""), ("libXrandr", "1.5.5", ""), ("libXres", "1.2.3", ""), ("libXtst", "1.2.5", ""),
    ("libxkbfile", "1.2.0", "meson"), ("libxshmfence", "1.3.3", ""),
]:
    if how == "meson":
        meson(n, name, ver, f"{name}-{ver}.tar.xz")
    else:
        autotools(n, name, ver, f"{name}-{ver}.tar.xz", (XORG + " " + how).strip())
    n += 1

# ---- what the display server needs, and the display server
n = 250
meson(n, "pixman", "0.46.4", "pixman-0.46.4.tar.gz", "-D tests=disabled -D demos=disabled"); n += 1
write(n, "libjpeg-turbo", "3.2.0", "libjpeg-turbo-3.2.0.tar.gz", """
mkdir build && cd build
cmake -D CMAKE_INSTALL_PREFIX=/usr -D CMAKE_BUILD_TYPE=RELEASE -D ENABLE_STATIC=FALSE \\
  -D CMAKE_INSTALL_DEFAULT_LIBDIR=lib -D CMAKE_SKIP_INSTALL_RPATH=ON ..
make
make DESTDIR="$DEST" install
"""); n += 1
meson(n, "libxcvt", "0.1.3", "libxcvt-0.1.3.tar.xz"); n += 1
autotools(n, "nettle", "4.0", "nettle-4.0.tar.gz", "--prefix=/usr --disable-static", after='chmod 755 "$DEST"/usr/lib/lib{hogweed,nettle}.so'); n += 1
meson(n, "xkeyboard-config", "2.48", "xkeyboard-config-2.48.tar.xz", note="The keyboard layouts of the world."); n += 1
autotools(n, "xkbcomp", "1.5.0", "xkbcomp-1.5.0.tar.xz", XORG); n += 1
write(n, "tigervnc", "1.16.2", "tigervnc-1.16.2.tar.gz", """
# Only the server (Xvnc) is built: an X display without a screen, whose picture goes out over
# the VNC protocol. The desktop gives every graphical application one of these.
patch -Np1 -i "$S/tigervnc-1.16.2-configuration_fixes-1.patch"
grep -rl _digest | xargs sed -Ei '/digest/s/([^,]*),.*,(.*)/\\1,\\2/'
grep -rl _DIGEST | xargs sed -i '/DIGEST/s/, 16//'
mkdir -p unix/xserver
tar -xf "$S/xorg-server-21.1.24.tar.xz" --strip-components=1 -C unix/xserver
( cd unix/xserver
  patch -Np1 -i ../xserver21.patch
  sed -e '/sha.h/s/sha/sha1/' -e '/sha1/a #include <nettle/version.h>' -e 's/ctx, 20/ctx/' -i os/xsha1.c )
cmake -G "Unix Makefiles" -D CMAKE_INSTALL_PREFIX=/usr -D CMAKE_BUILD_TYPE=Release -D BUILD_VIEWER=OFF \\
  -D ENABLE_NLS=OFF -D ENABLE_GNUTLS=OFF -D ENABLE_PAM=OFF -W no-author .
make
cd unix/xserver
autoreconf -fiv
./configure --prefix=/usr --sysconfdir=/etc --localstatedir=/var --disable-static \\
  --disable-xorg --disable-xnest --disable-xvfb --disable-xwin --disable-xephyr --disable-kdrive \\
  --disable-devel-docs --disable-config-hal --disable-config-udev --disable-unit-tests --disable-selective-werror \\
  --disable-dri --disable-dri2 --disable-dri3 --disable-glx --disable-glamor --disable-secure-rpc --disable-xdmcp \\
  --without-dtrace --with-pic --with-xkb-path=/usr/share/X11/xkb --with-xkb-bin-directory=/usr/bin
make
make -C hw/vnc DESTDIR="$DEST" install
""", "The display server."); n += 1

# ---- GTK and what it stands on
n = 270
meson(n, "fribidi", "1.0.16", "fribidi-1.0.16.tar.xz", "-D docs=false -D tests=false"); n += 1
meson(n, "libxml2", "2.15.3", "libxml2-2.15.3.tar.xz", "-D history=enabled -D icu=disabled -D python=disabled -D docs=disabled",
      before="""sed -i "/'git'/,+3d" meson.build"""); n += 1
meson(n, "shared-mime-info", "2.5.1", "shared-mime-info-2.5.1.tar.gz", "-D update-mimedb=false -D build-tests=false -D build-spec=false -D build-translations=false",
      after='# The database of file types, made from the descriptions just installed.\n./update-mime-database "$DEST/usr/share/mime" || ./src/update-mime-database "$DEST/usr/share/mime"'); n += 1
meson(n, "cairo", "1.18.4", "cairo-1.18.4.tar.xz", "-D tests=disabled"); n += 1
meson(n, "pango", "1.58.2", "pango-1.58.2.tar.xz", "--wrap-mode=nofallback -D introspection=disabled -D build-testsuite=false -D build-examples=false"); n += 1
meson(n, "at-spi2-core", "2.60.6", "at-spi2-core-2.60.6.tar.xz", "-D gtk2_atk_adaptor=false -D introspection=disabled -D docs=false"); n += 1
meson(n, "gdk-pixbuf", "2.44.7", "gdk-pixbuf-2.44.7.tar.xz", "--wrap-mode=nofallback -D png=enabled -D jpeg=enabled -D gif=enabled -D tiff=disabled -D glycin=disabled -D thumbnailer=disabled -D introspection=disabled -D man=false -D documentation=false -D tests=false -D installed_tests=false",
      after='# Which picture formats it reads: listed once, here, for the files of this package.\n( cd "$DEST" && LD_LIBRARY_PATH="$DEST/usr/lib" GDK_PIXBUF_MODULEDIR="$DEST"/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders usr/bin/gdk-pixbuf-query-loaders | sed "s|$DEST||g" > usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache ) || true'); n += 1
meson(n, "libepoxy", "1.5.10", "libepoxy-1.5.10.tar.xz", "-D egl=no -D glx=yes -D x11=true -D tests=false -D docs=false"); n += 1
meson(n, "libxkbcommon", "1.13.2", "libxkbcommon-1.13.2.tar.gz", "-D enable-docs=false -D enable-wayland=false -D enable-tools=false",
      before='patch -Np1 -i "$S/libxkbcommon-1.13.2-upstream_fix-1.patch"'); n += 1
autotools(n, "hicolor-icon-theme", "0.18", "hicolor-icon-theme-0.18.tar.xz", "--prefix=/usr"); n += 1
meson(n, "gsettings-desktop-schemas", "50.1", "gsettings-desktop-schemas-50.1.tar.xz", "-D introspection=false",
      before="""sed -i -r 's:"(/system):"/org/gnome\\1:g' schemas/*.in"""); n += 1
meson(n, "gtk3", "3.24.52", "gtk-3.24.52.tar.xz", "-D man=false -D broadway_backend=true -D wayland_backend=false -D introspection=false -D demos=false -D examples=false -D tests=false -D print_backends=file -D colord=no",
      "GTK 3: the toolkit most Linux applications draw their windows with.",
      after="""# Settings every GTK application starts with.
mkdir -p "$DEST/etc/gtk-3.0"
printf '%s\\n' '[Settings]' 'gtk-theme-name = Adwaita' 'gtk-icon-theme-name = Adwaita' 'gtk-font-name = DejaVu Sans 10' \\
  'gtk-xft-antialias = 1' 'gtk-xft-hinting = 1' 'gtk-xft-hintstyle = hintslight' > "$DEST/etc/gtk-3.0/settings.ini\""""); n += 1
write(n, "dejavu-fonts", "2.37", "dejavu-fonts-ttf-2.37.tar.bz2", """
install -d "$DEST/usr/share/fonts/dejavu"
install -m644 ttf/*.ttf "$DEST/usr/share/fonts/dejavu/"
""", "Letters: the DejaVu family (sans, serif, monospace)."); n += 1
write(n, "cargo-c", "0.10.24", "cargo-c-0.10.24.tar.gz", """
export CARGO_HOME=$PWD/.cargo-home
cargo build --release
install -d "$DEST/usr/bin"
install -m755 target/release/cargo-capi target/release/cargo-cbuild target/release/cargo-cinstall target/release/cargo-ctest "$DEST/usr/bin/"
""", "A cargo command that librsvg is built with."); n += 1
meson(n, "librsvg", "2.62.3", "librsvg-2.62.3.tar.xz", "-D introspection=disabled -D docs=disabled -D vala=disabled -D tests=false",
      "Draws SVG pictures: the icons of the desktop's applications are SVG.", before="export CARGO_HOME=$PWD/.cargo-home"); n += 1
meson(n, "adwaita-icon-theme", "50.0", "adwaita-icon-theme-50.0.tar.xz"); n += 1
write(n, "desktop-caches", "0.1", "", """
# Not a package of files from elsewhere: the lists that GTK, GLib and fontconfig read at
# start-up, made once for everything installed so far.
install -d "$DEST/usr/share/glib-2.0/schemas" "$DEST/usr/lib/gtk-3.0/3.0.0" "$DEST/usr/share/icons/Adwaita" "$DEST/usr/share/icons/hicolor" "$DEST/var/cache/fontconfig"
glib-compile-schemas --targetdir="$DEST/usr/share/glib-2.0/schemas" /usr/share/glib-2.0/schemas
gtk-query-immodules-3.0 > "$DEST/usr/lib/gtk-3.0/3.0.0/immodules.cache"
gdk-pixbuf-query-loaders > "$DEST/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache" 2>/dev/null || { install -d "$DEST/usr/lib/gdk-pixbuf-2.0/2.10.0"; gdk-pixbuf-query-loaders > "$DEST/usr/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache"; }
gtk-update-icon-cache -q -f /usr/share/icons/Adwaita && cp /usr/share/icons/Adwaita/icon-theme.cache "$DEST/usr/share/icons/Adwaita/"
gtk-update-icon-cache -q -f /usr/share/icons/hicolor && cp /usr/share/icons/hicolor/icon-theme.cache "$DEST/usr/share/icons/hicolor/"
fc-cache -f -s
cp -a /var/cache/fontconfig/. "$DEST/var/cache/fontconfig/" 2>/dev/null || true
"""); n += 1

# ---- applications
n = 300
autotools(n, "geany", "2.1", "geany-2.1.tar.bz2", "--prefix=/usr --disable-html-docs --disable-pdf-docs --disable-api-docs",
          "Geany: a small, fast editor and development environment."); n += 1

print(f"{count} recipes in recipes/desktop")
