# For recipes that build a Rust program from its published crate.
#
# use_system_openssl: a crate's own list of exact versions (Cargo.lock) may name a version of
# the OpenSSL bindings from before OpenSSL 4, which this system has. The bindings alone are
# moved to the version that Agave itself is built with; everything else stays as published.
use_system_openssl() {
  if grep -q 'name = "openssl-sys"' Cargo.lock; then
    cargo update -p openssl-sys --precise 0.9.117
    ! grep -q 'name = "openssl"' Cargo.lock || cargo update -p openssl --precise 0.10.81
  fi
}
