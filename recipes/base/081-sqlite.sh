pkg=sqlite ver=3.53.4 src=sqlite-autoconf-3530400.tar.gz
build() {
  ./configure --prefix=/usr --disable-static --enable-fts4 --enable-fts5 \
    CPPFLAGS="-D SQLITE_ENABLE_COLUMN_METADATA=1 -D SQLITE_ENABLE_UNLOCK_NOTIFY=1 -D SQLITE_ENABLE_DBSTAT_VTAB=1 -D SQLITE_SECURE_DELETE=1"
  make LDFLAGS.rpath=""
  make DESTDIR="$DEST" install
}
