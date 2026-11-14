pkg=cleanup
# The cross toolchain has done its work: the system now builds with its own tools.
build() {
  rm -rf /usr/share/{info,man,doc}/*
  find /usr/lib /usr/libexec -name '*.la' -delete
  rm -rf /tools
}
