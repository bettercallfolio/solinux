pkg=spl-token ver=5.6.1 src=spl-token-cli-5.6.1.crate
# The command-line tool for tokens, in the version this release of Agave names.
build() {
  . "$REPO/recipes/common/cargo.inc"
  export CARGO_HOME=$PWD/.cargo-home
  use_system_openssl
  cargo install --locked --path . --root "$DEST/usr"
  rm -f "${DEST:?}/usr/.crates.toml" "${DEST:?}/usr/.crates2.json"
}
