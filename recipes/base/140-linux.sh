pkg=linux ver=6.18.63 src=linux-6.18.63.tar.xz
# The kernel: the long-term 6.18 series with the Solinux configuration (kernel/solinux.config).
build() {
  make mrproper
  make defconfig
  make kvm_guest.config
  scripts/kconfig/merge_config.sh -m .config "$REPO/kernel/solinux.config"
  make olddefconfig
  # Stop if a decision of ours did not make it into the final configuration.
  local want
  for want in CONFIG_TCP_CONG_BBR=y CONFIG_XDP_SOCKETS=y CONFIG_OVERLAY_FS=y CONFIG_BLK_DEV_NVME=y \
      CONFIG_VIRTIO_BLK=y CONFIG_EXT4_FS=y CONFIG_EFI_STUB=y CONFIG_USER_NS=y CONFIG_FUSE_FS=y \
      CONFIG_CMDLINE_BOOL=y CONFIG_BPF_JIT=y CONFIG_VIRTIO_NET=y CONFIG_HZ_1000=y; do
    grep -qx "$want" .config || { echo "kernel configuration lost $want"; return 1; }
  done
  make
  local rel; rel=$(make -s kernelrelease)
  make INSTALL_MOD_PATH="$DEST/usr" INSTALL_MOD_STRIP=1 modules_install
  rm -f "${DEST:?}/usr/lib/modules/$rel/build" "${DEST:?}/usr/lib/modules/$rel/source"
  install -Dm644 arch/x86/boot/bzImage "$DEST/boot/vmlinuz-$rel"
  install -Dm644 System.map "$DEST/boot/System.map-$rel"
  install -Dm644 .config "$DEST/boot/config-$rel"
}
