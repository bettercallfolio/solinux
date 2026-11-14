pkg=gdb ver=17.2 src=gdb-17.2.tar.xz
# GDB: the debugger for C, C++, Rust and more.
build() {
  mkdir build && cd build
  ../configure --prefix=/usr --with-system-readline --with-system-zlib --with-python=/usr/bin/python3
  make
  make -C gdb DESTDIR="$DEST" install
  make -C gdbserver DESTDIR="$DEST" install
}
