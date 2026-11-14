#!/bin/bash
# Builds the whole base system, stage after stage. Finished recipes are skipped,
# so after a failure it can simply be started again.
set -euo pipefail
cd "$(dirname "$0")"
./fetch.sh
./host-stage.sh cross
./host-stage.sh temp
./chroot-stage.sh chroot
./chroot-stage.sh base
