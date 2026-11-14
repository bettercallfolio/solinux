pkg=cargo-build-sbf ver=4.4.0 src=cargo-build-sbf-4.4.0.crate
# cargo build-sbf and cargo test-sbf: build Solana programs. The version this release of Agave names.
build() {
  . "$REPO/recipes/common/cargo.inc"
  export CARGO_HOME=$PWD/.cargo-home
  use_system_openssl
  cargo install --locked --path . --root "$DEST/usr"
  rm -f "${DEST:?}/usr/.crates.toml" "${DEST:?}/usr/.crates2.json"
  # The tools expect rustup. Solinux has none, so each is started through solana/cargo-sbf,
  # which gives it Solana's compiler directly (see that file).
  install -d "$DEST/usr/lib/solana"
  local b
  for b in cargo-build-sbf cargo-test-sbf; do
    mv "$DEST/usr/bin/$b" "$DEST/usr/lib/solana/$b"
    install -m755 "$REPO/solana/cargo-sbf" "$DEST/usr/bin/$b"
  done
}
