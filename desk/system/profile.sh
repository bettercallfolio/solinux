# A shell that someone opens says where the desktop is, and starts it if nothing has yet
# (a machine that was not booted has no service manager to do that).
case $- in *i*) ;; *) return 0 2>/dev/null || exit 0 ;; esac
if command -v node >/dev/null 2>&1 && [ -x /usr/bin/solinux-desk ]; then
  _url="$HOME/.local/state/solinux/desk.url"
  if [ -d /run/systemd/system ] && systemctl -q is-enabled solinux-desk.service 2>/dev/null; then
    : # a booted system: the service manager starts the desktop (it may still be on its way up)
  elif [ ! -s "$_url" ] || ! pgrep -f /usr/lib/solinux/desk/server/main.ts >/dev/null 2>&1; then
    mkdir -p "$HOME/.local/state/solinux"
    : > "$_url"
    (setsid /usr/bin/solinux-desk > "$HOME/.local/state/solinux/desk.log" 2>&1 &)
  fi
  # the desktop writes its address when it is ready; give it a moment
  for _i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50; do
    [ -s "$_url" ] && break
    sleep 0.1
  done
  [ -s "$_url" ] && printf '\nDesktop: \033[1;32m%s\033[0m\n\n' "$(cat "$_url")"
  unset _url _i
fi
