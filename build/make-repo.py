#!/usr/bin/env python3
"""Makes a package repository out of the packages that were built.

    make-repo.py [<stage>...]          default: base solana desktop apps extra

Writes <work>/repo/: every package as <name>-<version>.tar.xz, and index.json, which says
for each package its version, a one-line summary, sizes, SHA-256, what else it needs, and,
when it brings an application, how the desktop shows it. `pkg` installs from this.

What a package needs is found, not written down: every shared library its programs ask for
is looked up among the files of the other packages. A recipe adds needs that cannot be seen
this way (data, fonts, programs it starts) with a line  deps="name name".
"""
import glob
import hashlib
import json
import os
import re
import subprocess
import sys
import tarfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_SRC = os.path.join(HERE, "..")
WORK = os.environ.get("WORK", os.path.expanduser("~/build"))
PKG = os.path.join(WORK, "packages")
OUT = os.path.join(WORK, "repo")
stages = sys.argv[1:] or ["base", "solana", "desktop", "apps", "extra"]
os.makedirs(OUT, exist_ok=True)

ELF = b"\x7fELF"


def needed(data):
    """The shared libraries an ELF file asks for (DT_NEEDED), read straight from its bytes."""
    import struct
    if data[:4] != ELF or data[4] != 2 or data[5] != 1:   # 64-bit, little-endian only
        return []
    e_phoff, = struct.unpack_from("<Q", data, 32)
    e_phentsize, e_phnum = struct.unpack_from("<HH", data, 54)
    loads, dyn = [], None
    for i in range(e_phnum):
        p_type, _flags, p_offset, p_vaddr, _paddr, p_filesz = struct.unpack_from("<IIQQQQ", data, e_phoff + i * e_phentsize)
        if p_type == 1:
            loads.append((p_vaddr, p_offset, p_filesz))
        elif p_type == 2:
            dyn = (p_offset, p_filesz)
    if not dyn:
        return []

    def offset(vaddr):
        for va, off, size in loads:
            if va <= vaddr < va + size:
                return off + vaddr - va
        return None
    names, strtab = [], None
    for pos in range(dyn[0], dyn[0] + dyn[1], 16):
        tag, val = struct.unpack_from("<qQ", data, pos)
        if tag == 0:
            break
        if tag == 1:
            names.append(val)
        elif tag == 5:
            strtab = offset(val)
    if strtab is None:
        return []
    out = []
    for n in names:
        end = data.index(b"\0", strtab + n)
        out.append(data[strtab + n:end].decode("ascii", "replace"))
    return out


def desktop_entry(text):
    entry, inside = {}, False
    for line in text.split("\n"):
        line = line.strip()
        if line.startswith("["):
            inside = line == "[Desktop Entry]"
        elif inside and "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            entry[k.strip()] = v.strip()
    if entry.get("Type") != "Application" or entry.get("NoDisplay") == "true" or not entry.get("Name"):
        return None
    return {"name": entry["Name"], "icon": entry.get("Icon", ""), "comment": entry.get("Comment", entry.get("GenericName", ""))}


# One line about each package for people; a package not listed is described by its recipe's first comment line.
SUMMARIES = {}
for line in open(os.path.join(HERE, "summaries.txt")):
    m = re.match(r"^([^#\s:][^:]*):\s+(.+)$", line.rstrip())
    if m:
        SUMMARIES[m.group(1)] = m.group(2)

packages, order = {}, []
for stage in stages:
    for recipe in sorted(glob.glob(os.path.join(REPO_SRC, "recipes", stage, "*.sh"))):
        text = open(recipe).read()
        m = re.search(r"^pkg=(\S+)", text, re.M)
        if not m:
            continue
        name = m.group(1)
        tar = os.path.join(PKG, name + ".tar")
        if not os.path.exists(tar):
            continue
        ver = open(os.path.join(PKG, name + ".version")).read().strip() or "0"
        # the summary: the first comment line under the pkg= line
        lines = text.split("\n")
        summary = lines[1][2:].strip() if len(lines) > 1 and lines[1].startswith("# ") else ""
        # "Geany: a small, fast editor." reads "A small, fast editor" beside the name; otherwise the first sentence
        named = re.match(r"^[\w .+-]{1,24}:\s+(\S.*)$", summary)
        if named:
            summary = named.group(1)[0].upper() + named.group(1)[1:]
        summary = re.split(r"(?<=[.:])\s", summary)[0].rstrip(".:")
        extra = re.search(r'^deps="([^"]*)"', text, re.M)
        summary = SUMMARIES.get(name, summary)
        packages[name] = {"version": ver, "summary": summary, "set": stage, "explicit": extra.group(1).split() if extra else [], "tar": tar}
        order.append(name)

# who provides which library
provides = {}
for name in order:
    for f in open(os.path.join(PKG, name + ".files")).read().split("\n"):
        base = os.path.basename(f)
        if ".so" in base and f.startswith("usr/lib/"):
            provides.setdefault(base, name)

index = {"format": 1, "name": "solinux", "updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "packages": {}}
for name in order:
    p = packages[name]
    libs, app, installed = set(), None, 0
    with tarfile.open(p["tar"]) as t:
        for member in t:
            if not member.isfile():
                continue
            installed += member.size
            path = member.name.lstrip("./")
            if path.startswith("usr/share/applications/") and path.endswith(".desktop") and (not app or os.path.basename(path) == name + ".desktop"):
                # (a package with several entries is shown by the one that carries its own name)
                app = desktop_entry(t.extractfile(member).read().decode("utf-8", "replace")) or app
            elif member.size > 64 and (path.startswith(("usr/bin/", "usr/sbin/", "usr/libexec/")) or ".so" in os.path.basename(path)):
                f = t.extractfile(member)
                if f.read(4) == ELF:
                    f.seek(0)
                    try:
                        libs.update(needed(f.read()))
                    except Exception:
                        pass
    deps = sorted({provides[l] for l in libs if l in provides and provides[l] != name} | {d for d in p["explicit"] if d in packages and d != name})
    archive = f"{name}-{p['version']}.tar.xz"
    target = os.path.join(OUT, archive)
    if not os.path.exists(target) or os.path.getmtime(target) < os.path.getmtime(p["tar"]):
        with open(target + ".part", "wb") as out:
            subprocess.run(["xz", "-T0", "-6", "-c", p["tar"]], stdout=out, check=True)
        os.replace(target + ".part", target)
    data = open(target, "rb").read()
    entry = {"version": p["version"], "summary": p["summary"], "file": archive, "size": len(data), "installed": installed,
             "sha256": hashlib.sha256(data).hexdigest(), "deps": deps, "set": p["set"]}
    if app:
        entry["app"] = app
    index["packages"][name] = entry

json.dump(index, open(os.path.join(OUT, "index.json"), "w"), indent=1)
total = sum(e["size"] for e in index["packages"].values())
apps = [n for n, e in index["packages"].items() if "app" in e]
print(f"{len(index['packages'])} packages, {total / 1e6:.1f} MB, in {OUT}")
print("applications: " + (", ".join(apps) if apps else "none yet"))
