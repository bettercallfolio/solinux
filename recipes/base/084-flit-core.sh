pkg=flit-core ver=4.0.2 src=flit_core-4.0.2.tar.gz
# Python packages are built into a wheel and installed from it, without touching the network.
build() {
  pip3 wheel -w dist --no-cache-dir --no-build-isolation --no-deps "$PWD"
  pip3 install --no-index --find-links dist --root "$DEST" --no-warn-script-location flit_core
}
