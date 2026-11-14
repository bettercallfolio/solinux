pkg=mesa ver=26.1.7 src=mesa-26.1.7.tar.xz
# OpenGL without a graphics card: the processor draws (llvmpipe). No hardware drivers and no Vulkan are built.
build() {
  mkdir build && cd build
  meson setup .. --prefix=/usr --buildtype=release -D platforms=x11 -D gallium-drivers=llvmpipe -D vulkan-drivers= -D glx=dri -D egl=enabled -D gbm=enabled -D gles1=disabled -D gles2=enabled -D llvm=enabled -D shared-llvm=enabled -D glvnd=disabled -D video-codecs= -D valgrind=disabled -D libunwind=disabled
  ninja
  DESTDIR="$DEST" ninja install
}
