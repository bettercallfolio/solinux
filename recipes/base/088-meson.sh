pkg=meson ver=1.12.0 src=meson-1.12.0.tar.gz
build() {
  pip3 wheel -w dist --no-cache-dir --no-build-isolation --no-deps "$PWD"
  pip3 install --no-index --find-links dist --root "$DEST" --no-warn-script-location meson
}
