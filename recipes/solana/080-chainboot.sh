pkg=chainboot ver=0.3.0
# chainboot: stores whole systems on Solana and runs them. Solinux itself comes from it,
# and can publish and run other systems with it. It also makes the chain a remote for git.
build() {
  install -d "$DEST/usr/lib/chainboot" "$DEST/usr/bin"
  tar -xzf "$S/chainboot-0.3.0.tar.gz" -C "$DEST/usr/lib/chainboot" --no-same-owner
  printf '#!/bin/sh\nexec node /usr/lib/chainboot/chainboot.mjs "$@"\n' > "$DEST/usr/bin/chainboot"
  # git starts this for an address that begins with sol:// (git clone sol://<owner>/<name>)
  printf '#!/bin/sh\nexec node /usr/lib/chainboot/chainboot.mjs git-remote "$@"\n' > "$DEST/usr/bin/git-remote-sol"
  chmod 755 "$DEST/usr/bin/chainboot" "$DEST/usr/bin/git-remote-sol"
}
