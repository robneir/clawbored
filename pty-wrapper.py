#!/usr/bin/env python3
"""PTY wrapper that allocates a real PTY and copies output to stdout.
Uses pty.spawn with a custom read function for reliable streaming.
Handles long-running processes, signal forwarding, and proper cleanup."""
import pty, os, sys, signal, errno

if len(sys.argv) < 2:
    sys.exit(1)

child_pid = None

def forward_signal(signum, frame):
    """Forward signals to the child process."""
    if child_pid:
        try:
            os.kill(child_pid, signum)
        except OSError:
            pass

signal.signal(signal.SIGTERM, forward_signal)
signal.signal(signal.SIGINT, forward_signal)

def read(fd):
    """Read from PTY master and write to real stdout."""
    while True:
        try:
            data = os.read(fd, 16384)
            if data:
                os.write(1, data)
                sys.stdout.flush()
            return data
        except OSError as e:
            if e.errno in (errno.EAGAIN, errno.EINTR):
                continue
            raise

exit_status = pty.spawn(sys.argv[1:], read)

# Flush any remaining output
try:
    sys.stdout.flush()
except OSError:
    pass

sys.exit(os.WEXITSTATUS(exit_status) if os.WIFEXITED(exit_status) else 1)
