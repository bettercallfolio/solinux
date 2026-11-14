pkg=iana-etc ver=20260805 src=iana-etc-20260805.tar.gz
build() {
  mkdir -p "$DEST/etc"
  cp services protocols "$DEST/etc"
}
