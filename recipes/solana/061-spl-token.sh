pkg=spl-token ver=5.7.1
# The command-line tool for tokens.
build() {
  export CARGO_HOME=$PWD/.cargo-home
  cargo install spl-token-cli --version 5.7.1 --locked --root "$DEST/usr"
  rm -f "${DEST:?}/usr/.crates.toml" "${DEST:?}/usr/.crates2.json"
}
