pkg=cmake ver=4.4.2 src=cmake-4.4.2.tar.gz
# A build tool that LLVM, Protobuf and several Rust crates need.
build() {
  sed -i '/"lib64"/s/64//' Modules/GNUInstallDirs.cmake
  ./bootstrap --prefix=/usr --parallel="$JOBS" --mandir=/share/man --docdir=/share/doc/cmake \
    --system-curl --system-zlib --system-expat --system-bzip2 --system-liblzma --system-zstd --system-nghttp2 \
    --no-system-libarchive --no-system-libuv --no-system-jsoncpp --no-system-cppdap --no-system-librhash
  make
  make DESTDIR="$DEST" install
}
