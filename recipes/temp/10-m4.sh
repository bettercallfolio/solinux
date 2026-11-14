pkg=m4 ver=1.4.21 src=m4-1.4.21.tar.xz
# Temporary tools: each is cross-compiled and installed into the new system,
# only so that the real packages can later be built inside it.
build() {
  mkdir -p "$ROOT/usr/share"
  cat > "$ROOT/usr/share/config.site" <<SITE
ac_cv_func_posix_spawn_file_actions_addchdir=yes
ac_cv_func_posix_spawn_file_actions_addfchdir=yes
SITE
  ./configure --prefix=/usr --host="$TARGET" --build="$(build-aux/config.guess)"
  make
  make DESTDIR="$ROOT" install
}
