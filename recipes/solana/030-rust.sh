pkg=rust ver=1.97.1 src=rustc-1.97.1-src.tar.xz
# The Rust compiler and cargo, built from source on the system's LLVM. 1.97.1 is the version
# Agave 4.3 asks for. (The build starts from the previous Rust release, which it downloads.)
build() {
  cat > bootstrap.toml <<'X'
change-id = 154587

[llvm]
link-shared = true

[build]
description = "Solinux"
docs = false
tools = ["cargo", "clippy", "rustdoc", "rustfmt", "src"]

[install]
prefix = "/usr"
sysconfdir = "/etc"

[rust]
channel = "stable"
lto = "thin"
codegen-units = 1
llvm-bitcode-linker = false

[target.x86_64-unknown-linux-gnu]
llvm-config = "/usr/bin/llvm-config"
X
  export LIBSQLITE3_SYS_USE_PKG_CONFIG=1
  ./x.py build
  DESTDIR="$DEST" ./x.py install
}
