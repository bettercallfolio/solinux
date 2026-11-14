pkg=cargo-c ver=0.10.24 src=cargo-c-0.10.24.tar.gz
# A cargo command that librsvg is built with.
build() {
  export CARGO_HOME=$PWD/.cargo-home
  cargo build --release
  install -d "$DEST/usr/bin"
  install -m755 target/release/cargo-capi target/release/cargo-cbuild target/release/cargo-cinstall target/release/cargo-ctest "$DEST/usr/bin/"
}
