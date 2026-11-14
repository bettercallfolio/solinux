pkg=vim ver=9.2.1025 src=vim-9.2.1025.tar.gz
build() {
  echo '#define SYS_VIMRC_FILE "/etc/vimrc"' >> src/feature.h
  ./configure --prefix=/usr
  make
  make DESTDIR="$DEST" install
  ln -s vim "$DEST/usr/bin/vi"
  ln -s vim.1 "$DEST/usr/share/man/man1/vi.1"
  mkdir -p "$DEST/etc"
  cat > "$DEST/etc/vimrc" <<'X'
source $VIMRUNTIME/defaults.vim
let skip_defaults_vim=1
set nocompatible
set backspace=2
set mouse=
syntax on
if (&term == "xterm") || (&term == "putty")
  set background=dark
endif
X
}
