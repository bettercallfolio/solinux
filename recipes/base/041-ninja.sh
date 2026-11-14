pkg=ninja ver=1.13.2 src=ninja-1.13.2.tar.gz
build() {
  python3 configure.py --bootstrap
  install -Dm755 ninja "$DEST/usr/bin/ninja"
}
