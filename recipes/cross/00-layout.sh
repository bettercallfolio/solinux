pkg=layout
# The empty skeleton the cross toolchain installs into.
build() {
  mkdir -p "$ROOT"/{etc,var,tools,lib64} "$ROOT"/usr/{bin,lib,sbin}
  for i in bin lib sbin; do
    [ -e "$ROOT/$i" ] || ln -s usr/$i "$ROOT/$i"
  done
}
