/*
 * solinux-pty: runs a command on a new terminal and carries its bytes over pipes.
 *
 *   solinux-pty <columns> <rows> <command> [arguments...]
 *
 *   standard input   ->  what the user types
 *   standard output  <-  what the terminal shows
 *   file descriptor 3 ->  "<columns> <rows>\n" whenever the window changes size
 *
 * The desk server starts one of these for every terminal it shows in the browser.
 * It ends when the command ends, with the command's exit status.
 */
#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <poll.h>
#include <pty.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/wait.h>
#include <termios.h>
#include <unistd.h>

static int write_all(int fd, const char *buf, ssize_t len) {
    while (len > 0) {
        ssize_t n = write(fd, buf, (size_t)len);
        if (n < 0) {
            if (errno == EINTR) continue;
            if (errno == EAGAIN) { struct pollfd p = { fd, POLLOUT, 0 }; poll(&p, 1, -1); continue; }
            return -1;
        }
        buf += n; len -= n;
    }
    return 0;
}

int main(int argc, char **argv) {
    if (argc < 4) {
        fprintf(stderr, "usage: solinux-pty <columns> <rows> <command> [arguments...]\n");
        return 2;
    }
    struct winsize size = { 0 };
    size.ws_col = (unsigned short)atoi(argv[1]);
    size.ws_row = (unsigned short)atoi(argv[2]);
    if (size.ws_col < 2) size.ws_col = 80;
    if (size.ws_row < 2) size.ws_row = 24;

    /* Look for the size channel first: without one, the new terminal itself may become descriptor 3. */
    int control = fcntl(3, F_GETFD) >= 0 ? 3 : -1;
    int master;
    pid_t child = forkpty(&master, NULL, NULL, &size);
    if (child < 0) { perror("solinux-pty: forkpty"); return 1; }
    if (child == 0) {
        if (control >= 0) close(control);
        execvp(argv[3], argv + 3);
        fprintf(stderr, "solinux-pty: cannot run %s: %s\n", argv[3], strerror(errno));
        _exit(127);
    }

    signal(SIGPIPE, SIG_IGN);
    char buf[65536], line[64];
    size_t have = 0;
    int in_open = 1;

    for (;;) {
        struct pollfd fds[3] = {
            { master, POLLIN, 0 },
            { in_open ? 0 : -1, POLLIN, 0 },
            { control, POLLIN, 0 },
        };
        if (poll(fds, 3, -1) < 0) { if (errno == EINTR) continue; break; }

        if (fds[0].revents & (POLLIN | POLLHUP | POLLERR | POLLNVAL)) {
            ssize_t n = read(master, buf, sizeof buf);
            if (n <= 0) { if (n < 0 && errno == EINTR) continue; break; }   /* the command closed the terminal */
            if (write_all(1, buf, n) < 0) break;                             /* nobody is listening any more */
        }
        if (in_open && (fds[1].revents & (POLLIN | POLLHUP | POLLERR))) {
            ssize_t n = read(0, buf, sizeof buf);
            if (n > 0) write_all(master, buf, n);
            else if (n == 0 || errno != EINTR) {
                /* the server went away: hang the terminal up, as closing a window would */
                in_open = 0;
                kill(-child, SIGHUP);
                kill(child, SIGHUP);
            }
        }
        if (control >= 0 && (fds[2].revents & (POLLIN | POLLHUP | POLLERR))) {
            ssize_t n = read(control, line + have, sizeof line - 1 - have);
            if (n <= 0) { if (n == 0 || errno != EINTR) { close(control); control = -1; } continue; }
            have += (size_t)n;
            line[have] = 0;
            char *end;
            while ((end = strchr(line, '\n'))) {
                int cols = 0, rows = 0;
                *end = 0;
                if (sscanf(line, "%d %d", &cols, &rows) == 2 && cols > 1 && rows > 1 && cols < 2000 && rows < 2000) {
                    size.ws_col = (unsigned short)cols;
                    size.ws_row = (unsigned short)rows;
                    ioctl(master, TIOCSWINSZ, &size);
                }
                have -= (size_t)(end + 1 - line);
                memmove(line, end + 1, have + 1);
            }
            if (have >= sizeof line - 1) have = 0;   /* a line that long is not ours */
        }
    }

    close(master);
    int status = 0;
    while (waitpid(child, &status, 0) < 0 && errno == EINTR) { }
    if (WIFEXITED(status)) return WEXITSTATUS(status);
    if (WIFSIGNALED(status)) return 128 + WTERMSIG(status);
    return 1;
}
