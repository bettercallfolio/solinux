pkg=anchor ver=1.2.2 src=anchor-1.2.2.tar.gz
# Anchor: the framework most Solana programs are written with.
build() {
  export CARGO_HOME=$PWD/.cargo-home
  cargo build --release --locked -p anchor-cli
  install -Dm755 target/release/anchor "$DEST/usr/bin/anchor"
}
