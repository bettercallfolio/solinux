pkg=dejavu-fonts ver=2.37 src=dejavu-fonts-ttf-2.37.tar.bz2
# Letters: the DejaVu family (sans, serif, monospace).
build() {
  install -d "$DEST/usr/share/fonts/dejavu"
  install -m644 ttf/*.ttf "$DEST/usr/share/fonts/dejavu/"
}
