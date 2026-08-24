#!/usr/bin/env python3
"""Read-only smoke test for a deployed Nabz production origin."""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request


def request(base_url: str, path: str, method: str = "GET") -> tuple[int, dict, object]:
    req = urllib.request.Request(base_url.rstrip("/") + path, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.status
            headers = dict(response.headers.items())
            body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        status = exc.code
        headers = dict(exc.headers.items())
        body = exc.read().decode("utf-8")
    try:
        payload: object = json.loads(body) if body else None
    except json.JSONDecodeError:
        payload = body
    return status, headers, payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url", nargs="?", default="http://127.0.0.1")
    args = parser.parse_args()
    failures: list[str] = []

    live_status, live_headers, live = request(args.base_url, "/api/health/live")
    if live_status != 200 or not isinstance(live, dict) or live.get("status") != "alive":
        failures.append("liveness probe failed")
    if not any(key.lower() == "x-request-id" for key in live_headers):
        failures.append("X-Request-ID response header missing")

    ready_status, _, ready = request(args.base_url, "/api/health/ready")
    if ready_status != 200 or not isinstance(ready, dict) or ready.get("status") != "ready":
        failures.append("readiness probe failed")

    for path in ("/docs", "/redoc", "/openapi.json"):
        status, _, _ = request(args.base_url, path)
        if status != 404:
            failures.append(f"{path} is exposed (HTTP {status})")

    demo_status, _, _ = request(args.base_url, "/api/demo/hassan", method="POST")
    if demo_status != 404:
        failures.append(f"demo API is exposed (HTTP {demo_status})")

    if failures:
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print("Production smoke passed: live, ready, request IDs, docs off, demo off")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
