pkg=spl-token ver=5.6.1
# The command-line tool for tokens, in the version this release of Agave names.
build() {
  export CARGO_HOME=$PWD/.cargo-home
  cargo install spl-token-cli --version 5.6.1 --locked --root "$DEST/usr"
  rm -f "${DEST:?}/usr/.crates.toml" "${DEST:?}/usr/.crates2.json"
}
