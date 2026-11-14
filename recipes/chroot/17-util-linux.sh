pkg=util-linux ver=2.42.2 src=util-linux-2.42.2.tar.xz
build() {
  mkdir -p /var/lib/hwclock
  ./configure --libdir=/usr/lib --runstatedir=/run --disable-chfn-chsh --disable-login \
    --disable-nologin --disable-su --disable-setpriv --disable-runuser --disable-pylibmount \
    --disable-static --disable-liblastlog2 --without-python ADJTIME_PATH=/var/lib/hwclock/adjtime
  make
  make install
}
