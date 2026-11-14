pkg=wheel ver=0.48.0 src=wheel-0.48.0.tar.gz
build() {
  pip3 wheel -w dist --no-cache-dir --no-build-isolation --no-deps "$PWD"
  pip3 install --no-index --find-links dist --root "$DEST" --no-warn-script-location wheel
}
