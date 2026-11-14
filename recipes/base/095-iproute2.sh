pkg=iproute2 ver=7.1.0 src=iproute2-7.1.0.tar.xz
build() {
  sed -i /ARPD/d Makefile
  rm -f man/man8/arpd.8
  make NETNS_RUN_DIR=/run/netns
  make SBINDIR=/usr/sbin DESTDIR="$DEST" install
}
