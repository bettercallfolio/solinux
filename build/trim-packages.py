#!/usr/bin/env python3
"""Applies the rules for what a package carries to packages that were built before a rule existed.

    trim-packages.py [--write]

Without --write it only says what it would take out. The rules are the ones the build applies
to new packages (build/lib.sh finish_package, and the recipes of python and llvm): no GNU info
manuals, translations only for the languages kept, no Python test suite or Tk programs, no
static copies of LLVM. A package that already follows them is left untouched.
"""
import fnmatch
import os
import re
import sys
import tarfile

WORK = os.environ.get("WORK", os.path.expanduser("~/build"))
PKG = os.path.join(WORK, "packages")
KEEP_LOCALES = re.compile(r"^(en|en_.*|de|es|fr|it|ja|ko|pt_BR|ru|tr|zh_CN|locale\.alias)$")
ONLY = {
    "python": ["usr/lib/python3.*/test", "usr/lib/python3.*/idlelib", "usr/lib/python3.*/turtledemo", "usr/lib/python3.*/tkinter",
               "usr/lib/python3.*/config-3.*/libpython3.*.a"],
    "llvm": ["usr/lib/libLLVM*.a", "usr/lib/libclang*.a", "usr/lib/liblld*.a"],
}


def dropped(pkg, path):
    if path == "usr/share/info" or path.startswith("usr/share/info/"):
        return True
    m = re.match(r"^usr/share/locale/([^/]+)(/|$)", path)
    if m and not KEEP_LOCALES.match(m.group(1)):
        return True
    for pattern in ONLY.get(pkg, []):
        parts = pattern.count("/") + 1
        head = "/".join(path.split("/")[:parts])
        if fnmatch.fnmatchcase(head, pattern):
            return True
    return False


write = "--write" in sys.argv
total = 0
for name in sorted(os.listdir(PKG)):
    if not name.endswith(".tar"):
        continue
    pkg = name[:-4]
    src = os.path.join(PKG, name)
    with tarfile.open(src) as t:
        members = t.getmembers()
        out = [m for m in members if not dropped(pkg, m.name[2:] if m.name.startswith("./") else m.name)]
        gone = len(members) - len(out)
        if not gone:
            continue
        saved = sum(m.size for m in members) - sum(m.size for m in out)
        total += saved
        print(f"{pkg:28} {gone:6} entries, {saved / 1e6:7.1f} MB")
        if not write:
            continue
        with tarfile.open(src + ".new", "w", format=t.format or tarfile.GNU_FORMAT) as new:
            for m in out:
                new.addfile(m, t.extractfile(m) if m.isfile() else None)
    os.replace(src + ".new", src)
    names = sorted((m.name[2:] if m.name.startswith("./") else m.name) for m in out if m.name not in (".", "./"))
    # (written beside and moved into place: the old list may belong to another user)
    listing = os.path.join(PKG, pkg + ".files")
    with open(listing + ".new", "w") as f:
        f.write("\n".join(names) + "\n")
    os.replace(listing + ".new", listing)
print(f"{'taken out' if write else 'would take out'}: {total / 1e6:.0f} MB")
