pkg=openssh ver=10.5p1 src=openssh-10.5p1.tar.gz
# The SSH client, and the server (off until someone turns it on).
build() {
  ./configure --prefix=/usr --sysconfdir=/etc/ssh --with-privsep-path=/var/lib/sshd \
    --with-default-path=/usr/bin --with-superuser-path=/usr/sbin:/usr/bin --with-pid-dir=/run
  make
  make DESTDIR="$DEST" install-nokeys
  install -m755 contrib/ssh-copy-id "$DEST/usr/bin/ssh-copy-id"
  install -d -m700 "$DEST/var/lib/sshd"
  mkdir -p "$DEST/usr/lib/systemd/system"
  cat > "$DEST/usr/lib/systemd/system/sshd.service" <<'X'
[Unit]
Description=OpenSSH server
After=network.target

[Service]
ExecStartPre=/usr/bin/ssh-keygen -A
ExecStart=/usr/sbin/sshd -D
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure

[Install]
WantedBy=multi-user.target
X
}
