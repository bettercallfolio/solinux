#!/usr/bin/env python3
"""Writes several small files from one text: a line "@@@ <name>" starts the file <name>.

    split-bundle.py <bundle> <directory>

Only a convenience for writing many recipes at once; the recipes are the files it leaves.
"""
import os
import sys

bundle, directory = sys.argv[1], sys.argv[2]
os.makedirs(directory, exist_ok=True)
name, lines, count = None, [], 0


def flush():
    global count
    if name is None:
        return
    while lines and not lines[-1].strip():
        lines.pop()
    with open(os.path.join(directory, name), "w") as f:
        f.write("".join(lines) + ("" if lines and lines[-1].endswith("\n") else "\n"))
    count += 1


for line in open(bundle):
    if line.startswith("@@@ "):
        flush()
        name, lines = line[4:].strip(), []
    elif name is not None:
        lines.append(line)
flush()
print(f"{count} files in {directory}")
