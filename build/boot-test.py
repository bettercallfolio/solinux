#!/usr/bin/env python3
"""Boots an assembled system in a virtual machine and checks that it comes up.

    boot-test.py <image name> [command ...]

It makes a disk from <work>/images/<name>/rootfs, starts QEMU with the system's own kernel
and initramfs, waits for the root shell on the serial console, runs the commands given (or
a standard set), and powers the machine off. Everything the console printed is kept in
<work>/images/<name>/boot.log. Exit status 0 means every command succeeded.
"""
import os
import re
import select
import subprocess
import sys
import time

WORK = os.environ.get("WORK", os.path.expanduser("~/build"))
name = sys.argv[1] if len(sys.argv) > 1 else "solinux"
commands = sys.argv[2:] or [
    "uname -sr",
    "cat /etc/os-release | head -n 2",
    "systemctl is-system-running --wait || systemctl --failed --no-pager",
    "sysctl vm.max_map_count net.core.rmem_max net.ipv4.tcp_congestion_control",
    "ip -brief address",
    "curl -sS -o /dev/null -w 'https status %{http_code}\\n' https://api.devnet.solana.com/health || true",
    "df -h / | tail -n 1",
    "free -m | sed -n 2p",
]
out = os.path.join(WORK, "images", name)
root = os.path.join(out, "rootfs")
disk = os.path.join(out, "disk.img")
log_path = os.path.join(out, "boot.log")


def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, check=True, text=True, capture_output=True, **kw).stdout.strip()


boot = sh(f"sudo ls {root}/boot").split()
kernel = sorted(f for f in boot if f.startswith("vmlinuz-"))[-1]
initrd = "initrd.img-" + kernel[len("vmlinuz-"):]
for f in (kernel, initrd):
    sh(f"sudo cp {root}/boot/{f} {out}/{f} && sudo chown {os.getuid()} {out}/{f}")

# A disk with one ext4 file system holding the whole system (sized to it, with room to work).
used_mb = int(sh(f"sudo du -sm {root}").split()[0])
size_mb = used_mb + max(2048, used_mb // 2)
if os.path.exists(disk):
    os.rename(disk, disk + ".old")
sh(f"truncate -s {size_mb}M {disk}")
sh(f"sudo mke2fs -q -t ext4 -L solinux-root -d {root} {disk} && sudo chown {os.getuid()} {disk}")
print(f"disk: {size_mb} MB ({used_mb} MB used), kernel {kernel}")

qemu = [
    "qemu-system-x86_64", "-enable-kvm", "-cpu", "host", "-m", "4096", "-smp", "4", "-nographic", "-no-reboot",
    "-kernel", f"{out}/{kernel}", "-initrd", f"{out}/{initrd}",
    "-append", "root=LABEL=solinux-root rw console=ttyS0,115200 quiet",
    "-drive", f"file={disk},format=raw,if=virtio",
    "-netdev", "user,id=n0", "-device", "virtio-net-pci,netdev=n0",
]
t0 = time.time()
p = subprocess.Popen(qemu, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
log = open(log_path, "wb")
seen = b""


def wait_for(pattern, timeout):
    """Reads the console until the pattern shows up. Returns the text before it, or None."""
    global seen
    end = time.time() + timeout
    while time.time() < end:
        m = re.search(pattern, seen)
        if m:
            before, seen = seen[:m.start()], seen[m.end():]
            return before.decode("utf-8", "replace")
        if p.poll() is not None:
            return None
        r, _, _ = select.select([p.stdout], [], [], 0.5)
        if r:
            chunk = os.read(p.stdout.fileno(), 65536)
            if not chunk:
                return None
            log.write(chunk); log.flush()
            seen += chunk
    return None


# (the prompt carries colour codes between the name and the colon)
PROMPT = rb"solinux[^\r\n]*:[^\r\n]*# "
failed = []
if wait_for(PROMPT, 180) is None:
    print("FAILED: no root shell on the console within 3 minutes; the end of the console:")
    print(seen.decode("utf-8", "replace")[-3000:])
    p.kill(); sys.exit(1)
print(f"root shell after {time.time() - t0:.1f} s")
for i, cmd in enumerate(commands):
    mark = f"__done_{i}__"
    p.stdin.write(f"{cmd}; echo {mark}$?\n".encode()); p.stdin.flush()
    text = wait_for(mark.encode() + rb"(\d+)\r?\n", 120)
    if text is None:
        print(f"FAILED (no answer): {cmd}"); failed.append(cmd); break
    # the echoed command line comes first; what follows is the command's output
    lines = [l.rstrip() for l in text.replace("\r", "").split("\n")]
    body = "\n".join(l for l in lines[1:] if l.strip())
    code = re.search(rb"__done_%d__(\d+)" % i, log_tail := open(log_path, "rb").read()[-4000:])
    status = int(code.group(1)) if code else 1
    print(f"$ {cmd}\n{body}" + ("" if status == 0 else f"\n(exit status {status})"))
    if status != 0:
        failed.append(cmd)
    wait_for(rb"# ", 10)
p.stdin.write(b"systemctl poweroff\n"); p.stdin.flush()
try:
    p.wait(timeout=60)
except subprocess.TimeoutExpired:
    p.kill()
log.close()
print(f"\n{'FAILED: ' + ', '.join(failed) if failed else 'the system booted and every check passed'} (console log: {log_path})")
sys.exit(1 if failed else 0)
