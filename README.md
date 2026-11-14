# Solinux

**A Linux system built from source for people who build on Solana, with a desktop that opens
in your browser.**

Solinux is not based on Ubuntu, Debian or any other distribution. Every package is compiled
from its original source with the recipes in this repository: the C library, the compiler,
the kernel, the desktop, the Solana tools. It is stored on Solana with
[chainboot](https://github.com/bettercallfolio/chainboot) and runs natively on your own
computer.

> **Status: under construction.** This repository is the work in progress. Read
> [what works today](#what-works-today) before you expect anything.

## What you get

- **A complete system.** Shell, compiler, git, SSH, editors, the tools a Linux user expects.
- **Solana, ready.** The validator and command-line tools (Agave), a local test validator,
  Rust, Anchor, Node.js. Built from source, in the versions that belong together.
- **A real desktop, in a browser tab.** Windows, a dock, a launcher. Terminal, files, pictures,
  music and video, PDF documents, a calculator, a Solana explorer, key management, the local
  validator: all there when the system starts. Ordinary Linux applications (an editor, a
  web browser) open in windows of the same desktop.
- **Applications from packages.** `pkg install <name>`, or the Software application. Packages
  come from a repository that is itself stored on Solana.
- **A kernel of its own.** When Solinux boots as a real system, it runs its own Linux kernel
  with the settings Solana's software asks for built in.

Nothing is emulated. Programs run directly on your processor; the desktop only carries their
picture to the browser.

## How the desktop works

`solinux-desk` is a small server inside the system. Your browser opens the address it prints
and shows the desktop. The desktop's own applications are web pages that talk to that server.
A graphical Linux application gets a private X display (Xvnc) of exactly the size of its
window; the browser shows that display in the window. Resize the window and the display
follows.

Whoever has the desktop's access token can do everything you can do on the system. By default
the server listens on this computer only.

## What works today

| | |
|---|---|
| Build system: recipes, pinned sources, packages | Works. |
| Base system (about 110 packages, kernel 6.18 LTS, systemd) | Being built for the first time. Not yet booted. |
| Solana layer (Rust, LLVM, Node.js, Agave, Anchor) | Recipes written, not yet built. |
| Graphics (X libraries, GTK 3, Xvnc), Firefox, Geany | Recipes written, not yet built. |
| The desktop | Works on a development computer (Ubuntu): windows, terminal, files, the everyday applications, Solana applications, native applications in windows, sharp on dense screens. Not yet tried inside Solinux itself. |
| `pkg`, the package manager | Works: installs with what is needed, removes, reads repositories from a directory, a web address or Solana (tried on devnet with a test repository). |
| Published on Solana | Not yet. |

Known limits:

- Sound from graphical Linux applications is not carried to the browser. The desktop's own
  music and video player has sound.
- There is no office suite yet.
- Only x86-64 for now.

## The repository

```
build/      the build system: fetch sources, run stages, assemble a system, make a repository
recipes/    one small shell file per package, by stage:
              cross, temp, chroot   the way from an empty directory to a system that builds itself
              base                  the system
              solana                the Solana developer layer
              desktop               graphics, the desktop, the web browser
              apps                  applications that are installed from the repository
kernel/     the kernel configuration (what differs from the kernel's defaults, and why)
boot/       the first program of a booted Solinux (finds the disk, hands over to the system)
desk/       the desktop: server, web page, the two small helper programs
pkg/        the package manager
sources.list  every source archive with its SHA-256
```

## Building it

You need a Linux computer with a compiler, about 60 GB of free disk and patience.

```sh
build/all.sh                              # everything, stage after stage; can be started again after a failure
build/assemble.sh solinux base solana desktop   # a root file system and an archive from the packages
build/boot-test.py solinux                # boots it in QEMU and checks that it comes up
build/make-repo.py                        # a package repository from the packages
```

Each recipe says where its source comes from and how it is built; `sources.list` pins every
archive by hash. Finished recipes are skipped, so the build continues where it stopped.

## Thank you

Solinux builds on the work of many people. The package versions and most build steps follow
[Linux From Scratch and Beyond Linux From Scratch](https://www.linuxfromscratch.org/) 13.1,
whose authors have documented for decades how a Linux system is put together. The terminal in
the desktop is [xterm.js](https://xtermjs.org/); windows of Linux applications are shown with
[noVNC](https://novnc.com/) and [TigerVNC](https://tigervnc.org/). And every package in
`sources.list` is somebody's work: the kernel, GNU, systemd, GTK, Mozilla, the Rust project,
Node.js, and Solana's engineers at Anza and elsewhere.

## License

MIT for everything written for Solinux (the build system, recipes, desktop, package
manager). Each package it builds keeps its own license. Vendored libraries carry theirs in
their directories.
