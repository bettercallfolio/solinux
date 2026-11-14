pkg=cargo-build-sbf ver=4.4.0 src=cargo-build-sbf-4.4.0.crate
# cargo build-sbf and cargo test-sbf: build Solana programs. The version this release of Agave names.
build() {
  . "$REPO/recipes/common/cargo.inc"
  export CARGO_HOME=$PWD/.cargo-home
  use_system_openssl
  cargo install --locked --path . --root "$DEST/usr"
  rm -f "${DEST:?}/usr/.crates.toml" "${DEST:?}/usr/.crates2.json"
}
