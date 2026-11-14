pkg=pkg ver=0.1.0
# pkg: Solinux's package manager. Packages come from a repository on chain.
build() {
  install -d "$DEST/usr/lib/solinux/pkg/vendor" "$DEST/usr/bin" "$DEST/etc/solinux" "$DEST/var/lib/solinux/pkg" "$DEST/var/cache/solinux/pkg"
  install -m644 "$REPO/pkg/pkg.ts" "$DEST/usr/lib/solinux/pkg/pkg.ts"
  install -m644 "$REPO/pkg/vendor/chainboot-sdk.mjs" "$DEST/usr/lib/solinux/pkg/vendor/chainboot-sdk.mjs"
  printf '{ "type": "module" }\n' > "$DEST/usr/lib/solinux/pkg/package.json"
  printf '#!/bin/sh\nexec node /usr/lib/solinux/pkg/pkg.ts "$@"\n' > "$DEST/usr/bin/pkg"
  chmod 755 "$DEST/usr/bin/pkg"
  install -m644 "$REPO/pkg/pkg.conf" "$DEST/etc/solinux/pkg.conf"
}
