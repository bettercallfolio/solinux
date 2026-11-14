pkg=agave ver=4.3.2 src=agave-4.3.2.tar.gz
# Solana's validator and tools, built from source: the command-line tools, the validator, the
# local test validator and the ledger tool.
build() {
  export CARGO_HOME=$PWD/.cargo-home
  # The repository's own script (scripts/cargo-install-all.sh) goes through rustup; these are
  # its steps with the system's Rust, which is the version Agave asks for.
  . scripts/agave-build-lists.sh
  local names=("${AGAVE_BINS_END_USER[@]}" "${AGAVE_BINS_VAL_OP[@]}" "${AGAVE_BINS_DEV[@]}") bins=() b
  for b in "${names[@]}"; do bins+=(--bin "$b"); done
  cargo build --release --locked --workspace "${bins[@]}"
  cargo build --release --locked --manifest-path dev-bins/Cargo.toml --bin agave-ledger-tool
  mkdir -p "$DEST/usr/bin/deps"
  for b in "${names[@]}"; do install -m755 "target/release/$b" "$DEST/usr/bin/$b"; done
  install -m755 dev-bins/target/release/agave-ledger-tool "$DEST/usr/bin/agave-ledger-tool"
  for b in target/release/deps/libsolana*program.*; do
    if [ -e "$b" ]; then cp "$b" "$DEST/usr/bin/deps/"; fi
  done
}
