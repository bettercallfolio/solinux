pkg=7zip ver=26.02 src=7zip-26.02.tar.gz
# 7-Zip: packs and unpacks 7z archives and many other formats.
build() {
  sed -i 's/-Werror //g' CPP/7zip/7zip_gcc.mak
  local i
  for i in Bundles/Alone Bundles/Alone7z Bundles/Format7zF UI/Console; do
    make -C "CPP/7zip/$i" -f ../../cmpl_gcc.mak
  done
  install -Dm755 CPP/7zip/Bundles/Alone/b/g/7za CPP/7zip/Bundles/Alone7z/b/g/7zr CPP/7zip/Bundles/Format7zF/b/g/7z.so \
    CPP/7zip/UI/Console/b/g/7z -t "$DEST/usr/lib/7zip/"
  install -d "$DEST/usr/bin"
  for i in 7z 7za 7zr; do
    printf '#!/bin/sh\nexec /usr/lib/7zip/%s "$@"\n' "$i" > "$DEST/usr/bin/$i"
    chmod 755 "$DEST/usr/bin/$i"
  done
}
