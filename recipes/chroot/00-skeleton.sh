pkg=skeleton
# From here on the build runs inside the new system. First: its directories and first files.
build() {
  . "$REPO/recipes/common/skeleton.inc"
  make_skeleton ""
}
