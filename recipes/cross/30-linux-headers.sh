pkg=linux-headers ver=6.18.63 src=linux-6.18.63.tar.xz
# The kernel's interface, as header files the C library is built against.
build() {
  make mrproper
  make headers
  find usr/include -type f ! -name '*.h' -delete
  cp -r usr/include "$ROOT/usr"
}
