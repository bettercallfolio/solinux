pkg=mupdf ver=1.26.12 src=mupdf-1.26.12-source.tar.gz
# MuPDF: a light reader for PDF, EPUB and comic books.
build() {
  printf '%s\n' 'USE_SYSTEM_FREETYPE := yes' 'USE_SYSTEM_HARFBUZZ := yes' 'USE_SYSTEM_LIBJPEG := yes' \
    'USE_SYSTEM_ZLIB := yes' 'USE_SYSTEM_CURL := yes' 'HAVE_GLUT := no' > user.make
  XCFLAGS=-fPIC make build=release shared=yes HAVE_GLUT=no
  make prefix=/usr shared=yes HAVE_GLUT=no DESTDIR="$DEST" install
  ln -sf mupdf-x11 "$DEST/usr/bin/mupdf"
  install -d "$DEST/usr/share/applications"
  printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=MuPDF' 'Comment=Read PDF, EPUB and comic books' \
    'Exec=mupdf %f' 'Icon=application-pdf' 'Categories=Office;Viewer;' 'MimeType=application/pdf;application/epub+zip;' \
    > "$DEST/usr/share/applications/mupdf.desktop"
}
