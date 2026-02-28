"use client";

import { useEffect, useRef, useState, useImperativeHandle, forwardRef } from "react";

export interface DeployTerminalHandle {
  deploy: (opts: { name: string; displayName?: string; template?: string }) => void;
}

interface DeployTerminalProps {
  onComplete?: (result: { success: boolean; name: string; port?: number; error?: string }) => void;
  onDeployStart?: () => void;
}

export const DeployTerminal = forwardRef<DeployTerminalHandle, DeployTerminalProps>(
  function DeployTerminal({ onComplete, onDeployStart }, ref) {
    const termRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<any>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const fitRef = useRef<any>(null);
    const sessionIdRef = useRef<string | null>(null);
    const [initialized, setInitialized] = useState(false);

    useEffect(() => {
      if (!termRef.current || initialized) return;

      Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]).then(([{ Terminal }, { FitAddon }]) => {
        const terminal = new Terminal({
          theme: {
            background: "#0c0c0f",
            foreground: "#d4d4d8",
            cursor: "#d4d4d8",
            cursorAccent: "#0c0c0f",
            selectionBackground: "rgba(99, 102, 241, 0.3)",
            black: "#18181b",
            red: "#ef4444",
            green: "#22c55e",
            yellow: "#eab308",
            blue: "#6366f1",
            magenta: "#a855f7",
            cyan: "#06b6d4",
            white: "#d4d4d8",
            brightBlack: "#52525b",
            brightRed: "#f87171",
            brightGreen: "#4ade80",
            brightYellow: "#facc15",
            brightBlue: "#818cf8",
            brightMagenta: "#c084fc",
            brightCyan: "#22d3ee",
            brightWhite: "#ffffff",
          },
          fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', Menlo, Monaco, monospace",
          fontSize: 13,
          lineHeight: 1.35,
          cursorBlink: true,
          cursorStyle: "bar" as const,
          scrollback: 10000,
          allowTransparency: true,
          convertEol: true,
        });

        const fitAddon = new FitAddon();
        terminal.loadAddon(fitAddon);
        terminal.open(termRef.current!);

        setTimeout(() => fitAddon.fit(), 50);

        terminalRef.current = terminal;
        fitRef.current = fitAddon;
        setInitialized(true);

        terminal.writeln("\x1b[2m Waiting for deploy command...\x1b[0m");

        const resizeObserver = new ResizeObserver(() => {
          try { fitAddon.fit(); } catch {}
        });
        resizeObserver.observe(termRef.current!);

        // Pipe terminal input to PTY
        terminal.onData((data: string) => {
          if (wsRef.current?.readyState === WebSocket.OPEN && sessionIdRef.current) {
            wsRef.current.send(JSON.stringify({ type: "input", sessionId: sessionIdRef.current, data }));
          }
        });
      });
    }, [initialized]);

    // Cleanup WebSocket on unmount
    useEffect(() => {
      return () => {
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      };
    }, []);

    useImperativeHandle(ref, () => ({
      deploy: (opts) => {
        const terminal = terminalRef.current;
        if (!terminal) return;

        // Close any existing connection
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }

        terminal.clear();
        terminal.writeln(`\x1b[1;36m⚡ Starting deployment of "${opts.name}"...\x1b[0m`);
        terminal.writeln(`\x1b[2m   Connecting to PTY server...\x1b[0m\n`);
        onDeployStart?.();

        const ws = new WebSocket("ws://localhost:3001");
        wsRef.current = ws;

        ws.onopen = () => {
          terminal.writeln(`\x1b[32m   Connected.\x1b[0m\n`);
          ws.send(JSON.stringify({
            type: "deploy",
            name: opts.name,
            displayName: opts.displayName,
            template: opts.template,
          }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);

            if (msg.type === "started") {
              sessionIdRef.current = msg.sessionId;
              terminal.writeln(`\x1b[2m   Session: ${msg.sessionId} | Port: ${msg.port}\x1b[0m\n`);
              // Send terminal size
              if (terminalRef.current) {
                ws.send(JSON.stringify({
                  type: "resize",
                  sessionId: msg.sessionId,
                  cols: terminalRef.current.cols,
                  rows: terminalRef.current.rows,
                }));
              }
            } else if (msg.type === "data") {
              terminal.write(msg.data);
            } else if (msg.type === "done") {
              if (msg.success) {
                terminal.writeln(`\n\x1b[1;32m✅ Deployment complete!\x1b[0m`);
                terminal.writeln(`\x1b[2m   Instance "${msg.name}" is ready on port ${msg.port}\x1b[0m`);
              } else {
                terminal.writeln(`\n\x1b[1;31m❌ Deployment finished with exit code ${msg.exitCode}\x1b[0m`);
              }
              onComplete?.({ success: !!msg.success, name: msg.name, port: msg.port, error: msg.error });
              sessionIdRef.current = null;
            } else if (msg.type === "error") {
              terminal.writeln(`\x1b[1;31mError: ${msg.message}\x1b[0m`);
              onComplete?.({ success: false, name: opts.name, error: msg.message });
            }
          } catch {
            // Non-JSON message, write as-is
            terminal.write(event.data);
          }
        };

        ws.onerror = () => {
          terminal.writeln("\x1b[1;31m✗ Failed to connect to PTY server.\x1b[0m");
          terminal.writeln("\x1b[2m  Make sure the PTY server is running: node pty-server.mjs\x1b[0m");
          onComplete?.({ success: false, name: opts.name, error: "PTY server connection failed" });
        };

        ws.onclose = () => {
          if (sessionIdRef.current) {
            terminal.writeln("\n\x1b[33m⚠ Connection closed unexpectedly\x1b[0m");
            onComplete?.({ success: false, name: opts.name, error: "Connection lost" });
            sessionIdRef.current = null;
          }
        };
      },
    }));

    return (
      <div
        ref={termRef}
        className="w-full h-full min-h-[400px] rounded-xl overflow-hidden"
        style={{ backgroundColor: "#0c0c0f", padding: "8px" }}
      />
    );
  }
);
