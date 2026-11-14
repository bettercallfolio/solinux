pkg=pyelftools ver=0.33 src=pyelftools-0.33.tar.gz
# Needed to build the boot loader that comes with systemd.
build() {
  pip3 wheel -w dist --no-cache-dir --no-build-isolation --no-deps "$PWD"
  pip3 install --no-index --find-links dist --root "$DEST" --no-warn-script-location pyelftools
}
