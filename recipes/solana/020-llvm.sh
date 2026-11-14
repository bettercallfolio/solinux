pkg=llvm ver=22.1.8 src=llvm-project-22.1.8.src.tar.xz
# LLVM with clang and lld. Rust is built on it, and Solana's programs need libclang to build.
# Targets: this processor, and BPF (the family Solana's own program format comes from).
build() {
  patch -Np1 -i "$S/llvm-22.1.8-upstream_fix-1.patch"
  grep -rl '#!.*python$' | xargs sed -i '1s/python$/python3/'
  sed 's/utility/tool/' -i llvm/utils/FileCheck/CMakeLists.txt
  mkdir -p "$DEST/etc/clang"
  echo -fstack-protector-strong > "$DEST/etc/clang/clang.cfg"
  echo -fstack-protector-strong > "$DEST/etc/clang/clang++.cfg"
  mkdir llvm/build && cd llvm/build
  CC=gcc CXX=g++ cmake -D CMAKE_INSTALL_PREFIX=/usr -D CMAKE_SKIP_INSTALL_RPATH=ON -D LLVM_ENABLE_FFI=ON \
    -D CMAKE_BUILD_TYPE=Release -D LLVM_BUILD_LLVM_DYLIB=ON -D LLVM_LINK_LLVM_DYLIB=ON -D LLVM_ENABLE_RTTI=ON \
    -D LLVM_TARGETS_TO_BUILD="host;BPF" -D LLVM_ENABLE_PROJECTS="clang;lld" -D LLVM_ENABLE_RUNTIMES=compiler-rt \
    -D LLVM_BINUTILS_INCDIR=/usr/include -D LLVM_INCLUDE_BENCHMARKS=OFF -D CLANG_DEFAULT_PIE_ON_LINUX=ON \
    -D CLANG_CONFIG_FILE_SYSTEM_DIR=/etc/clang -W no-author -G Ninja ..
  ninja
  DESTDIR="$DEST" ninja install
  # The static copies of LLVM, clang and lld (over 400 MB) are not part of the system: programs
  # link the shared libraries (compiler-rt's own static libraries, under lib/clang, stay).
  rm -f "${DEST:?}"/usr/lib/libLLVM*.a "${DEST:?}"/usr/lib/libclang*.a "${DEST:?}"/usr/lib/liblld*.a
}
