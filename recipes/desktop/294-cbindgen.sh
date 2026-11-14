pkg=cbindgen ver=0.29.4 src=cbindgen-0.29.4.tar.gz
# Writes C headers for Rust code: needed to build Firefox.
build() {
  export CARGO_HOME=$PWD/.cargo-home
  cargo build --release
  install -Dm755 target/release/cbindgen "$DEST/usr/bin/cbindgen"
}
