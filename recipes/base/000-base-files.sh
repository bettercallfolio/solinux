pkg=base-files ver=0.1
# The directories and the first files of the system: users, groups, name and version.
build() {
  . "$REPO/recipes/common/skeleton.inc"
  make_skeleton "$DEST"
  cat > "$DEST/etc/os-release" <<'X'
NAME="Solinux"
PRETTY_NAME="Solinux 0.1"
ID=solinux
VERSION="0.1"
VERSION_ID=0.1
HOME_URL="https://chainboot.dev"
X
  ln -s ../../etc/os-release "$DEST/usr/lib/os-release"
  echo solinux > "$DEST/etc/hostname"
  cat > "$DEST/etc/shells" <<'X'
/bin/sh
/bin/bash
X
  cat > "$DEST/etc/inputrc" <<'X'
set horizontal-scroll-mode Off
set meta-flag On
set input-meta On
set convert-meta Off
set output-meta On
set bell-style none
"\eOd": backward-word
"\eOc": forward-word
"\e[1~": beginning-of-line
"\e[4~": end-of-line
"\e[5~": beginning-of-history
"\e[6~": end-of-history
"\e[3~": delete-char
"\e[2~": quoted-insert
"\eOH": beginning-of-line
"\eOF": end-of-line
"\e[H": beginning-of-line
"\e[F": end-of-line
X
  cat > "$DEST/etc/profile" <<'X'
export PATH=/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin
export LANG=${LANG:-C.UTF-8}
if [ "$(id -u)" = 0 ]; then PS1='\[\e[1;32m\]\h\[\e[0m\]:\w# '; else PS1='\[\e[1;32m\]\u@\h\[\e[0m\]:\w$ '; fi
for f in /etc/profile.d/*.sh; do [ -r "$f" ] && . "$f"; done
unset f
X
  mkdir -p "$DEST/etc/profile.d" "$DEST/etc/skel" "$DEST/root"
  printf '[ -f /etc/profile ] && . /etc/profile\n' > "$DEST/etc/bash.bashrc"
  printf '[ -f /etc/bash.bashrc ] && . /etc/bash.bashrc\n' > "$DEST/etc/skel/.bashrc"
  cp "$DEST/etc/skel/.bashrc" "$DEST/root/.bashrc"
}
