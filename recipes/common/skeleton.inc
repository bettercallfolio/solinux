# make_skeleton <prefix>: the directories and the first files of an empty system.
# Used twice: on the live build root (prefix "") and for the base-files package.
make_skeleton() {
  local p=$1 i
  mkdir -p "$p"/{boot,home,mnt,opt,srv,etc,var,dev,proc,sys,run,usr}
  mkdir -p "$p"/usr/{bin,lib,sbin,include,src,libexec} "$p"/lib64
  for i in bin lib sbin; do [ -e "$p/$i" ] || ln -s usr/$i "$p/$i"; done
  mkdir -p "$p"/etc/{opt,sysconfig} "$p"/usr/lib/{firmware,locale}
  mkdir -p "$p"/usr/local/{bin,lib,sbin,include,src}
  mkdir -p "$p"/usr/{,local/}share/{doc,info,locale,man,misc,terminfo,zoneinfo}
  mkdir -p "$p"/usr/{,local/}share/man/man{1..8}
  mkdir -p "$p"/var/{cache,local,log,mail,opt,spool} "$p"/var/lib/{misc,locate}
  [ -e "$p/var/run" ] || ln -s ../run "$p/var/run"
  [ -e "$p/var/lock" ] || ln -s ../run/lock "$p/var/lock"
  install -d -m 0750 "$p/root"
  install -d -m 1777 "$p/tmp" "$p/var/tmp"
  [ -e "$p/etc/mtab" ] || ln -s ../proc/self/mounts "$p/etc/mtab"

  cat > "$p/etc/hosts" <<'X'
127.0.0.1  localhost
::1        localhost
X
  cat > "$p/etc/passwd" <<'X'
root:x:0:0:root:/root:/bin/bash
bin:x:1:1:bin:/dev/null:/usr/bin/false
daemon:x:6:6:Daemon User:/dev/null:/usr/bin/false
messagebus:x:18:18:D-Bus Message Daemon User:/run/dbus:/usr/bin/false
systemd-journal-gateway:x:73:73:systemd Journal Gateway:/:/usr/bin/false
systemd-journal-remote:x:74:74:systemd Journal Remote:/:/usr/bin/false
systemd-journal-upload:x:75:75:systemd Journal Upload:/:/usr/bin/false
systemd-network:x:76:76:systemd Network Management:/:/usr/bin/false
systemd-resolve:x:77:77:systemd Resolver:/:/usr/bin/false
systemd-timesync:x:78:78:systemd Time Synchronization:/:/usr/bin/false
systemd-coredump:x:79:79:systemd Core Dumper:/:/usr/bin/false
uuidd:x:80:80:UUID Generation Daemon User:/dev/null:/usr/bin/false
systemd-oom:x:81:81:systemd Out Of Memory Daemon:/:/usr/bin/false
sshd:x:50:50:sshd PrivSep:/var/lib/sshd:/usr/bin/false
nobody:x:65534:65534:Unprivileged User:/dev/null:/usr/bin/false
X
  cat > "$p/etc/group" <<'X'
root:x:0:
bin:x:1:daemon
sys:x:2:
kmem:x:3:
tape:x:4:
tty:x:5:
daemon:x:6:
floppy:x:7:
disk:x:8:
lp:x:9:
dialout:x:10:
audio:x:11:
video:x:12:
utmp:x:13:
clock:x:14:
cdrom:x:15:
adm:x:16:
messagebus:x:18:
systemd-journal:x:23:
input:x:24:
mail:x:34:
sshd:x:50:
kvm:x:61:
systemd-journal-gateway:x:73:
systemd-journal-remote:x:74:
systemd-journal-upload:x:75:
systemd-network:x:76:
systemd-resolve:x:77:
systemd-timesync:x:78:
systemd-coredump:x:79:
uuidd:x:80:
systemd-oom:x:81:
wheel:x:97:
users:x:999:
nogroup:x:65534:
X
  touch "$p"/var/log/{btmp,lastlog,faillog,wtmp}
  chgrp 13 "$p/var/log/lastlog"; chmod 664 "$p/var/log/lastlog"; chmod 600 "$p/var/log/btmp"
}
