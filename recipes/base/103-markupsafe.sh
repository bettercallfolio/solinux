pkg=markupsafe ver=3.0.3 src=markupsafe-3.0.3.tar.gz
build() {
  pip3 wheel -w dist --no-cache-dir --no-build-isolation --no-deps "$PWD"
  pip3 install --no-index --find-links dist --root "$DEST" --no-warn-script-location Markupsafe
}
