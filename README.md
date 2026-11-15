# Solinux

**A Linux system built from source for people who build on Solana, with a desktop that opens
in your browser.**

Solinux is not based on Ubuntu, Debian or any other distribution. Every package is compiled
from its original source with the recipes in this repository: the C library, the compiler,
the kernel, the desktop, the Solana tools. It is stored on Solana with
[chainboot](https://github.com/bettercallfolio/chainboot) and runs natively on your own
computer.

```sh
chainboot run solinux --lazy        # then open the address it prints
```

> **Status: early.** Version 0.1 is on Solana **devnet**. It is built for amd64 only. Read
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
| Build system: recipes, pinned sources, packages | Works. Every package below was built with it from source. |
| Base system (100 packages, kernel 6.18 LTS, systemd) | Built. Boots in a virtual machine with its own kernel: about 10 seconds to a shell, all services up. |
| Solana layer | Built: LLVM 22, Rust 1.97, Node.js 24, Agave 4.3 (command-line tools, validator, test validator), `spl-token`, `cargo build-sbf`, Anchor 1.2. Tried inside Solinux: a Rust program and an Anchor program were created, built and deployed to the local validator. |
| Graphics and applications | Built: the X libraries, GTK 3, Xvnc, Mesa (OpenGL drawn by the processor), Firefox, Geany. Firefox shows the web inside the desktop, WebGL included. |
| The desktop | Works inside Solinux. An automatic test goes through a whole session in a real browser (keys, the local validator, a transfer, the explorer, files, terminals, windows, a program from nothing to deployed) and passes. |
| `pkg`, the package manager | Works. Software installs an application from a repository on Solana devnet in seconds. |
| Published on Solana | On devnet, in chainboot's official catalog: the system (2.83 GB, 669 MB on chain; a later version sends only what changed), and the package repository (every package of the system, plus extra ones: shells, editors, debuggers, viewers). As a lazy machine, from an empty cache, the desktop answers after 29 to 51 seconds (five runs). |

Known limits:

- Sound from graphical Linux applications is not carried to the browser. The desktop's own
  music and video player has sound.
- There is no office suite yet.
- Only x86-64 (amd64) for now. On a computer with an ARM processor (Apple silicon), chainboot can
  only run it emulated, which is slow and has not been tried.
- The first `cargo build-sbf` (or `anchor build`) on a system downloads Solana's platform
  tools from GitHub (about 1.7 GB on disk). They are Solana's own build of Rust for its
  program format, and the one part of the developer tools that is not built from source here.
- Graphics are drawn by the processor. That is plenty for a desktop, an editor and the web;
  it is not for games.

## The repository

```
build/      the build system: fetch sources, run stages, assemble a system, make a repository
recipes/    one small shell file per package, by stage:
              cross, temp, chroot   the way from an empty directory to a system that builds itself
              base                  the system
              solana                the Solana developer layer
              desktop               graphics, the desktop, the web browser
              apps                  applications that come with the system
              extra                 packages that are installed on request (pkg install, Software)
kernel/     the kernel configuration (what differs from the kernel's defaults, and why)
boot/       the first program of a booted Solinux (finds the disk, hands over to the system)
desk/       the desktop: server, web page, the two small helper programs
solana/     what makes Solana's tools fit this system (cargo build-sbf without rustup)
pkg/        the package manager
sources.list  every source archive with its SHA-256
```

## Building it

You need a Linux computer with a compiler, about 60 GB of free disk and patience.

```sh
build/all.sh                              # everything, stage after stage; can be started again after a failure
build/assemble.sh solinux base solana desktop apps   # a root file system and an archive from the packages
build/try-image.sh solinux start          # runs it on this computer the way chainboot does; prints the desktop's address
build/boot-test.py solinux                # boots it in QEMU with its own kernel and checks that it comes up
build/make-repo.py                        # a package repository from the packages
node desk/test/scenario.mjs out http://127.0.0.1:7654 <token>   # a whole session in a real browser (needs Playwright)
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
