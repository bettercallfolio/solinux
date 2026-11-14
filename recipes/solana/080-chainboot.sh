pkg=chainboot ver=0.1.0
# chainboot: stores whole systems on Solana and runs them. Solinux itself comes from it,
# and can publish and run other systems with it.
build() {
  install -d "$DEST/usr/lib/chainboot" "$DEST/usr/bin"
  tar -xzf "$S/chainboot-0.1.0.tar.gz" -C "$DEST/usr/lib/chainboot" --no-same-owner
  printf '#!/bin/sh\nexec node /usr/lib/chainboot/chainboot.mjs "$@"\n' > "$DEST/usr/bin/chainboot"
  chmod 755 "$DEST/usr/bin/chainboot"
}
