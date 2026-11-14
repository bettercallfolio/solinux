pkg=gettext ver=1.0 src=gettext-1.0.tar.xz
# Temporary: only the three programs other packages need while they are built.
build() {
  ./configure --disable-shared
  make
  cp gettext-tools/src/{msgfmt,msgmerge,xgettext} /usr/bin
}
