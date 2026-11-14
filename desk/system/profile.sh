# A shell that someone opens says where the desktop is, and starts it if nothing has yet
# (a machine that was not booted has no service manager to do that).
case $- in *i*) ;; *) return 0 2>/dev/null || exit 0 ;; esac
if command -v node >/dev/null 2>&1 && [ -x /usr/bin/solinux-desk ]; then
  HOST=127.0.0.1 PORT=7654
  [ -r /etc/solinux/desk.conf ] && . /etc/solinux/desk.conf
  if ! (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
    mkdir -p "$HOME/.local/state/solinux"
    (setsid /usr/bin/solinux-desk > "$HOME/.local/state/solinux/desk.log" 2>&1 &)
    for _i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
      (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break
      sleep 0.1
    done
    unset _i
  fi
  if [ -r "$HOME/.config/solinux/desk-token" ]; then
    printf '\nDesktop: \033[1;32mhttp://127.0.0.1:%s/#token=%s\033[0m\n\n' "$PORT" "$(cat "$HOME/.config/solinux/desk-token")"
  fi
  unset HOST PORT
fi
