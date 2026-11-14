pkg=e2fsprogs ver=1.47.4 src=e2fsprogs-1.47.4.tar.gz
build() {
  mkdir build && cd build
  ../configure --prefix=/usr --sysconfdir=/etc --enable-elf-shlibs --disable-libblkid \
    --disable-libuuid --disable-uuidd --disable-fsck
  make
  make DESTDIR="$DEST" install
  rm -f "${DEST:?}"/usr/lib/{libcom_err,libe2p,libext2fs,libss}.a
  sed 's/metadata_csum_seed,//' -i "$DEST/etc/mke2fs.conf"
}
