pkg=glibc ver=2.44 src=glibc-2.44.tar.xz
# The C library, now built by the system's own compiler. Also: locales and time zones.
build() {
  patch -Np1 -i "$S/glibc-fhs-1.patch"
  patch -Np1 -i "$S/glibc-2.44-upstream_fixes-1.patch"
  mkdir build && cd build
  echo "rootsbindir=/usr/sbin" > configparms
  ../configure --prefix=/usr --disable-werror --disable-nscd libc_cv_slibdir=/usr/lib \
    --enable-stack-protector=strong --enable-kernel=5.10
  make
  touch /etc/ld.so.conf
  sed '/test-installation/s@$(PERL)@echo not running@' -i ../Makefile
  make DESTDIR="$DEST" install
  sed '/RTLDLIST=/s@/usr@@g' -i "$DEST/usr/bin/ldd"

  # The temporary compiler kept its own copies of two headers; it must use the system's now.
  local dir; dir=$(dirname "$(gcc -print-libgcc-file-name)")
  [ -e "$dir/include/limits.h" ] || mv "$dir"/include-fixed/limits.h "$dir/include/"
  [ -e "$dir/include/syslimits.h" ] || mv "$dir"/include-fixed/syslimits.h "$dir/include/"
  rm -rf "${dir:?}"/include-fixed/*

  mkdir -p "$DEST/usr/lib/locale"
  local l
  for l in en_US en_GB de_DE es_ES fr_FR it_IT ja_JP ko_KR pt_BR ru_RU tr_TR zh_CN; do
    I18NPATH=../localedata localedef --prefix="$DEST" -i "$l" -f UTF-8 "$l.UTF-8"
  done
  I18NPATH=../localedata localedef --prefix="$DEST" -i C -f UTF-8 C.UTF-8
  I18NPATH=../localedata localedef --prefix="$DEST" -i en_US -f ISO-8859-1 en_US

  cat > "$DEST/etc/nsswitch.conf" <<'X'
passwd: files systemd
group: files systemd
shadow: files systemd
hosts: mymachines resolve [!UNAVAIL=return] files myhostname dns
networks: files
protocols: files
services: files
ethers: files
rpc: files
X
  cat > "$DEST/etc/ld.so.conf" <<'X'
/usr/local/lib
/opt/lib
include /etc/ld.so.conf.d/*.conf
X
  mkdir -p "$DEST/etc/ld.so.conf.d"

  mkdir tz && cd tz && tar -xf "$S/tzdata2026c.tar.gz"
  local zi=$DEST/usr/share/zoneinfo tz
  mkdir -p "$zi"/{posix,right}
  for tz in etcetera southamerica northamerica europe africa antarctica asia australasia backward; do
    zic -L /dev/null -d "$zi" "$tz"
    zic -L /dev/null -d "$zi/posix" "$tz"
    zic -L leapseconds -d "$zi/right" "$tz"
  done
  cp zone.tab zone1970.tab iso3166.tab "$zi"
  zic -d "$zi" -p America/New_York
  ln -sf ../usr/share/zoneinfo/UTC "$DEST/etc/localtime"
}
