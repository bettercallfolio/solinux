pkg=setuptools ver=84.0.0 src=setuptools-84.0.0.tar.gz
build() {
  pip3 wheel -w dist --no-cache-dir --no-build-isolation --no-deps "$PWD"
  pip3 install --no-index --find-links dist --root "$DEST" --no-warn-script-location setuptools
}
