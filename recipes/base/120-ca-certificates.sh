pkg=ca-certificates ver=2026-11-05
# The certificate authorities that Mozilla trusts, as one file. HTTPS needs them.
build() {
  install -Dm644 "$S/cacert-2026-11-05.pem" "$DEST/etc/ssl/certs/ca-certificates.crt"
  ln -s certs/ca-certificates.crt "$DEST/etc/ssl/cert.pem"
}
