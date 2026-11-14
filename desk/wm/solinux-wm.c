/*
 * solinux-wm: the window manager behind one application window of the Solinux desktop.
 *
 * The desktop shows every graphical application in a window of its own in the browser, and
 * gives each a private X display of exactly that window's size. On such a display there is
 * nothing to arrange: the application's main window fills it, its dialogs float in the
 * middle, and when the browser window changes size the display and the main window follow.
 * That is all this program does.
 *
 *   solinux-wm            manage the display named by $DISPLAY
 *   solinux-wm --close    ask the application on $DISPLAY to close its windows
 *
 * On standard output it reports, one line each:
 *   title <text>          the title of the window in front changed
 *   windows <count>       the number of windows changed
 */
#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/cursorfont.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_WINDOWS 256

typedef struct { Window id; int dialog; int w, h; } Client;

static Display *dpy;
static Window root, check;
static int sw, sh;
static Client clients[MAX_WINDOWS];
static int count;
static char last_title[512];

static Atom WM_PROTOCOLS, WM_DELETE_WINDOW, WM_STATE, WM_TAKE_FOCUS, UTF8_STRING;
static Atom NET_SUPPORTED, NET_SUPPORTING_WM_CHECK, NET_WM_NAME, NET_ACTIVE_WINDOW, NET_CLIENT_LIST;
static Atom NET_WM_STATE, NET_WM_STATE_MAXIMIZED_VERT, NET_WM_STATE_MAXIMIZED_HORZ, NET_WM_STATE_FULLSCREEN;
static Atom NET_WM_WINDOW_TYPE, TYPE_DIALOG, TYPE_UTILITY, TYPE_SPLASH, TYPE_TOOLBAR, TYPE_MENU, TYPE_NORMAL;
static Atom NET_CLOSE_WINDOW, SOLINUX_CLOSE;

static int quiet_errors(Display *d, XErrorEvent *e) { (void)d; (void)e; return 0; }   /* windows vanish while we look at them */

static int find(Window w) {
    for (int i = 0; i < count; i++) if (clients[i].id == w) return i;
    return -1;
}

static int has_protocol(Window w, Atom protocol) {
    Atom *list = NULL; int n = 0, yes = 0;
    if (XGetWMProtocols(dpy, w, &list, &n)) {
        for (int i = 0; i < n; i++) if (list[i] == protocol) yes = 1;
        XFree(list);
    }
    return yes;
}

static void send_protocol(Window w, Atom protocol) {
    XEvent e = { 0 };
    e.xclient.type = ClientMessage; e.xclient.window = w; e.xclient.message_type = WM_PROTOCOLS;
    e.xclient.format = 32; e.xclient.data.l[0] = (long)protocol; e.xclient.data.l[1] = CurrentTime;
    XSendEvent(dpy, w, False, NoEventMask, &e);
}

static void get_title(Window w, char *out, size_t size) {
    Atom type; int format; unsigned long n, left; unsigned char *data = NULL;
    out[0] = 0;
    if (XGetWindowProperty(dpy, w, NET_WM_NAME, 0, 256, False, UTF8_STRING, &type, &format, &n, &left, &data) == Success && data) {
        snprintf(out, size, "%s", (char *)data); XFree(data);
        if (out[0]) return;
    }
    char *name = NULL;
    if (XFetchName(dpy, w, &name) && name) { snprintf(out, size, "%s", name); XFree(name); }
}

/* Is this a window that floats (a dialog, a palette), or the application's main window? */
static int is_dialog(Window w) {
    Window parent = None;
    if (XGetTransientForHint(dpy, w, &parent) && parent != None) return 1;
    Atom type; int format; unsigned long n, left; unsigned char *data = NULL;
    if (XGetWindowProperty(dpy, w, NET_WM_WINDOW_TYPE, 0, 8, False, XA_ATOM, &type, &format, &n, &left, &data) == Success && data) {
        Atom *types = (Atom *)data; int floats = 0;
        for (unsigned long i = 0; i < n; i++) {
            if (types[i] == TYPE_DIALOG || types[i] == TYPE_UTILITY || types[i] == TYPE_SPLASH || types[i] == TYPE_TOOLBAR || types[i] == TYPE_MENU) floats = 1;
            if (types[i] == TYPE_NORMAL) { floats = 0; break; }
        }
        XFree(data);
        if (floats) return 1;
    }
    XSizeHints hints; long supplied;
    if (XGetWMNormalHints(dpy, w, &hints, &supplied) && (hints.flags & PMinSize) && (hints.flags & PMaxSize)
        && hints.min_width == hints.max_width && hints.min_height == hints.max_height && hints.max_width > 0) return 1;   /* a window of one fixed size */
    return 0;
}

static void tell_size(Window w, int x, int y, int width, int height) {
    XConfigureEvent e = { 0 };
    e.type = ConfigureNotify; e.display = dpy; e.event = w; e.window = w;
    e.x = x; e.y = y; e.width = width; e.height = height; e.above = None; e.override_redirect = False;
    XSendEvent(dpy, w, False, StructureNotifyMask, (XEvent *)&e);
}

static void place(Client *c) {
    if (c->dialog) {
        int w = c->w > sw ? sw : c->w, h = c->h > sh ? sh : c->h;
        int x = (sw - w) / 2, y = (sh - h) / 3;
        XMoveResizeWindow(dpy, c->id, x, y < 0 ? 0 : y, (unsigned)w, (unsigned)h);
        tell_size(c->id, x, y < 0 ? 0 : y, w, h);
    } else {
        XMoveResizeWindow(dpy, c->id, 0, 0, (unsigned)sw, (unsigned)sh);
        tell_size(c->id, 0, 0, sw, sh);
    }
}

static void report(void) {
    /* the window in front: the last one in the list (new windows and clicked windows go to its end) */
    char title[512] = "";
    for (int i = count - 1; i >= 0; i--) if (!clients[i].dialog) { get_title(clients[i].id, title, sizeof title); break; }
    if (!title[0] && count) get_title(clients[count - 1].id, title, sizeof title);
    if (strcmp(title, last_title)) {
        snprintf(last_title, sizeof last_title, "%s", title);
        for (char *p = title; *p; p++) if (*p == '\n' || *p == '\r') *p = ' ';
        printf("title %s\n", title); fflush(stdout);
    }
}

static void publish(void) {
    Window list[MAX_WINDOWS];
    for (int i = 0; i < count; i++) list[i] = clients[i].id;
    XChangeProperty(dpy, root, NET_CLIENT_LIST, XA_WINDOW, 32, PropModeReplace, (unsigned char *)list, count);
    printf("windows %d\n", count); fflush(stdout);
}

static void focus(Window w) {
    int i = find(w);
    if (i < 0) return;
    Client c = clients[i];
    memmove(&clients[i], &clients[i + 1], (size_t)(count - i - 1) * sizeof(Client));
    clients[count - 1] = c;
    /* dialogs stay above main windows: raise the main window first, then every dialog */
    XRaiseWindow(dpy, w);
    for (int k = 0; k < count; k++) if (clients[k].dialog) XRaiseWindow(dpy, clients[k].id);
    XSetInputFocus(dpy, w, RevertToPointerRoot, CurrentTime);
    if (has_protocol(w, WM_TAKE_FOCUS)) send_protocol(w, WM_TAKE_FOCUS);
    XChangeProperty(dpy, root, NET_ACTIVE_WINDOW, XA_WINDOW, 32, PropModeReplace, (unsigned char *)&w, 1);
    report();
}

static void manage(Window w) {
    XWindowAttributes a;
    if (find(w) >= 0 || count >= MAX_WINDOWS || !XGetWindowAttributes(dpy, w, &a) || a.override_redirect) { XMapWindow(dpy, w); return; }
    Client *c = &clients[count++];
    c->id = w; c->dialog = is_dialog(w); c->w = a.width; c->h = a.height;
    XSetWindowBorderWidth(dpy, w, 0);
    XSelectInput(dpy, w, PropertyChangeMask | StructureNotifyMask | FocusChangeMask);
    /* a click anywhere in a window brings it to the front, and still reaches the application */
    XGrabButton(dpy, AnyButton, AnyModifier, w, True, ButtonPressMask, GrabModeSync, GrabModeAsync, None, None);
    long state[2] = { NormalState, None };
    XChangeProperty(dpy, w, WM_STATE, WM_STATE, 32, PropModeReplace, (unsigned char *)state, 2);
    if (!c->dialog) {
        Atom max[2] = { NET_WM_STATE_MAXIMIZED_VERT, NET_WM_STATE_MAXIMIZED_HORZ };
        XChangeProperty(dpy, w, NET_WM_STATE, XA_ATOM, 32, PropModeReplace, (unsigned char *)max, 2);
    }
    place(c);
    XMapWindow(dpy, w);
    publish();
    focus(w);
}

static void unmanage(Window w) {
    int i = find(w);
    if (i < 0) return;
    memmove(&clients[i], &clients[i + 1], (size_t)(count - i - 1) * sizeof(Client));
    count--;
    publish();
    if (count) focus(clients[count - 1].id); else report();
}

static void close_all(void) {
    /* front to back: a dialog that is open gets asked first */
    for (int i = count - 1; i >= 0; i--) {
        if (has_protocol(clients[i].id, WM_DELETE_WINDOW)) send_protocol(clients[i].id, WM_DELETE_WINDOW);
        else XKillClient(dpy, clients[i].id);
    }
}

static void atoms(void) {
#define A(name) XInternAtom(dpy, name, False)
    WM_PROTOCOLS = A("WM_PROTOCOLS"); WM_DELETE_WINDOW = A("WM_DELETE_WINDOW"); WM_STATE = A("WM_STATE"); WM_TAKE_FOCUS = A("WM_TAKE_FOCUS");
    UTF8_STRING = A("UTF8_STRING"); NET_SUPPORTED = A("_NET_SUPPORTED"); NET_SUPPORTING_WM_CHECK = A("_NET_SUPPORTING_WM_CHECK");
    NET_WM_NAME = A("_NET_WM_NAME"); NET_ACTIVE_WINDOW = A("_NET_ACTIVE_WINDOW"); NET_CLIENT_LIST = A("_NET_CLIENT_LIST");
    NET_WM_STATE = A("_NET_WM_STATE"); NET_WM_STATE_MAXIMIZED_VERT = A("_NET_WM_STATE_MAXIMIZED_VERT");
    NET_WM_STATE_MAXIMIZED_HORZ = A("_NET_WM_STATE_MAXIMIZED_HORZ"); NET_WM_STATE_FULLSCREEN = A("_NET_WM_STATE_FULLSCREEN");
    NET_WM_WINDOW_TYPE = A("_NET_WM_WINDOW_TYPE"); TYPE_DIALOG = A("_NET_WM_WINDOW_TYPE_DIALOG"); TYPE_UTILITY = A("_NET_WM_WINDOW_TYPE_UTILITY");
    TYPE_SPLASH = A("_NET_WM_WINDOW_TYPE_SPLASH"); TYPE_TOOLBAR = A("_NET_WM_WINDOW_TYPE_TOOLBAR"); TYPE_MENU = A("_NET_WM_WINDOW_TYPE_MENU");
    TYPE_NORMAL = A("_NET_WM_WINDOW_TYPE_NORMAL"); NET_CLOSE_WINDOW = A("_NET_CLOSE_WINDOW"); SOLINUX_CLOSE = A("_SOLINUX_CLOSE");
#undef A
}

int main(int argc, char **argv) {
    dpy = XOpenDisplay(NULL);
    if (!dpy) { fprintf(stderr, "solinux-wm: cannot open the display %s\n", getenv("DISPLAY") ? getenv("DISPLAY") : "(none set)"); return 1; }
    root = DefaultRootWindow(dpy);
    atoms();

    if (argc > 1 && !strcmp(argv[1], "--close")) {
        XEvent e = { 0 };
        e.xclient.type = ClientMessage; e.xclient.window = root; e.xclient.message_type = SOLINUX_CLOSE; e.xclient.format = 32;
        XSendEvent(dpy, root, False, SubstructureRedirectMask | SubstructureNotifyMask, &e);
        XSync(dpy, False);
        return 0;
    }

    XSetErrorHandler(quiet_errors);
    XSelectInput(dpy, root, SubstructureRedirectMask | SubstructureNotifyMask | StructureNotifyMask | PropertyChangeMask);
    XSync(dpy, False);
    sw = DisplayWidth(dpy, DefaultScreen(dpy)); sh = DisplayHeight(dpy, DefaultScreen(dpy));

    XDefineCursor(dpy, root, XCreateFontCursor(dpy, XC_left_ptr));
    XSetWindowBackground(dpy, root, 0x0f1113); XClearWindow(dpy, root);

    check = XCreateSimpleWindow(dpy, root, -1, -1, 1, 1, 0, 0, 0);
    XChangeProperty(dpy, check, NET_SUPPORTING_WM_CHECK, XA_WINDOW, 32, PropModeReplace, (unsigned char *)&check, 1);
    XChangeProperty(dpy, check, NET_WM_NAME, UTF8_STRING, 8, PropModeReplace, (unsigned char *)"solinux-wm", 10);
    XChangeProperty(dpy, root, NET_SUPPORTING_WM_CHECK, XA_WINDOW, 32, PropModeReplace, (unsigned char *)&check, 1);
    Atom supported[] = { NET_SUPPORTED, NET_SUPPORTING_WM_CHECK, NET_WM_NAME, NET_ACTIVE_WINDOW, NET_CLIENT_LIST, NET_WM_STATE,
                         NET_WM_STATE_MAXIMIZED_VERT, NET_WM_STATE_MAXIMIZED_HORZ, NET_WM_STATE_FULLSCREEN, NET_WM_WINDOW_TYPE, NET_CLOSE_WINDOW };
    XChangeProperty(dpy, root, NET_SUPPORTED, XA_ATOM, 32, PropModeReplace, (unsigned char *)supported, sizeof supported / sizeof supported[0]);

    /* windows that were there before us */
    Window r, p, *kids = NULL; unsigned int n = 0;
    if (XQueryTree(dpy, root, &r, &p, &kids, &n)) {
        for (unsigned int i = 0; i < n; i++) {
            XWindowAttributes a;
            if (XGetWindowAttributes(dpy, kids[i], &a) && a.map_state == IsViewable && !a.override_redirect) manage(kids[i]);
        }
        if (kids) XFree(kids);
    }
    printf("ready %d %d\n", sw, sh); fflush(stdout);

    for (;;) {
        XEvent e;
        XNextEvent(dpy, &e);
        switch (e.type) {
        case MapRequest: manage(e.xmaprequest.window); break;
        case ConfigureRequest: {
            XConfigureRequestEvent *q = &e.xconfigurerequest;
            int i = find(q->window);
            if (i < 0) {   /* not shown yet: it may have what it asks for */
                XWindowChanges c = { q->x, q->y, q->width, q->height, 0, q->above, q->detail };
                XConfigureWindow(dpy, q->window, (unsigned)(q->value_mask & ~(unsigned long)CWBorderWidth), &c);
            } else {
                if (clients[i].dialog) {
                    if (q->value_mask & CWWidth) clients[i].w = q->width;
                    if (q->value_mask & CWHeight) clients[i].h = q->height;
                }
                place(&clients[i]);
            }
            break;
        }
        case UnmapNotify: if (e.xunmap.event != root || 1) unmanage(e.xunmap.window); break;
        case DestroyNotify: unmanage(e.xdestroywindow.window); break;
        case ConfigureNotify:
            if (e.xconfigure.window == root && (e.xconfigure.width != sw || e.xconfigure.height != sh)) {
                sw = e.xconfigure.width; sh = e.xconfigure.height;   /* the browser window changed size */
                for (int i = 0; i < count; i++) place(&clients[i]);
            }
            break;
        case ButtonPress:
            if (count && clients[count - 1].id != e.xbutton.window && find(e.xbutton.window) >= 0) {
                /* a click on a main window does not go behind an open dialog of the application */
                int dialog_open = clients[count - 1].dialog && !clients[find(e.xbutton.window)].dialog;
                if (!dialog_open) focus(e.xbutton.window);
            }
            XAllowEvents(dpy, ReplayPointer, e.xbutton.time);
            break;
        case PropertyNotify:
            if (e.xproperty.atom == NET_WM_NAME || e.xproperty.atom == XA_WM_NAME) report();
            break;
        case ClientMessage:
            if (e.xclient.message_type == SOLINUX_CLOSE) close_all();
            else if (e.xclient.message_type == NET_ACTIVE_WINDOW) focus(e.xclient.window);
            else if (e.xclient.message_type == NET_CLOSE_WINDOW && find(e.xclient.window) >= 0) {
                if (has_protocol(e.xclient.window, WM_DELETE_WINDOW)) send_protocol(e.xclient.window, WM_DELETE_WINDOW);
                else XKillClient(dpy, e.xclient.window);
            }
            break;
        }
    }
}
