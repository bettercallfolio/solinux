pkg=mako ver=1.4.1 src=mako-1.4.1.tar.gz
# Mesa's build writes parts of its source with these templates.
build() {
  pip3 wheel -w dist --no-cache-dir --no-build-isolation --no-deps "$PWD"
  pip3 install --no-index --find-links dist --root "$DEST" --no-warn-script-location Mako
}
