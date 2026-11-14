pkg=gcc-check
# Not a package: stops the build if the new compiler does not produce programs for this system.
build() {
  echo 'int main(){return 0;}' > t.c
  cc t.c -v -Wl,--verbose > dummy.log 2>&1
  readelf -l a.out | grep -q ': /lib64/ld-linux-x86-64.so.2'
  grep -q '/usr/lib/libc.so.6 succeeded' dummy.log
  ./a.out
  printf '#include <iostream>\nint main(){std::cout<<"ok\\n";}\n' > t.cc
  g++ t.cc -o tcc && ./tcc | grep -q ok
}
