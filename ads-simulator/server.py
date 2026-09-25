#!/usr/bin/env python3
"""Digital Ad Lab local server: serves the simulator's files.

Usage:
    python ads-simulator/server.py            # http://localhost:8000
    python ads-simulator/server.py --port 9000 --host 0.0.0.0

You can also open the folder with any static web server (or host it on GitHub Pages).
"""

import argparse
import http.server
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def main():
    ap = argparse.ArgumentParser(description="Digital Ad Lab classroom server")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT))
    httpd = http.server.ThreadingHTTPServer((args.host, args.port), handler)
    print("Digital Ad Lab running at http://%s:%d  (Ctrl+C to stop)" % ("localhost" if args.host in ("0.0.0.0", "127.0.0.1") else args.host, args.port))
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
