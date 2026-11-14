#!/bin/bash
# Builds everything, stage after stage: the base system, the Solana developer layer, the
# desktop, and the applications. Finished recipes are skipped,
# so after a failure it can simply be started again.
set -euo pipefail
cd "$(dirname "$0")"
./fetch.sh
./host-stage.sh cross
./host-stage.sh temp
./chroot-stage.sh chroot
./chroot-stage.sh base
./chroot-stage.sh solana
./chroot-stage.sh desktop
./chroot-stage.sh apps
