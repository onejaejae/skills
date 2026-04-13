#!/usr/bin/env python3
"""sis-verifier CDP helper.

chromux의 CDP HTTP 인터페이스(`http://localhost:9310/json`)에서 SiS iframe target을
찾아 직접 attach하고, 다음 작업을 수행한다:

  - find             : SiS iframe target 정보 출력
  - buttons          : iframe 안 모든 button의 좌표 (가운데 점) 출력
  - query <selector> : 임의 selector의 element rect/존재 출력
  - click <x> <y>    : iframe-local 좌표로 mouse click dispatch
  - scroll <px>      : section.main의 scrollTop 설정
  - text-contains <substr> : iframe 안 body 텍스트에 substring 포함 여부 검증 (exit code 0/1)
  - errors           : 에러 배너(.stAlert/[role=alert]) 카운트 출력

전제:
  - chromux daemon이 9310 포트에서 동작 중
  - SiS 앱 페이지가 chromux session으로 열려 있음
  - websocket-client 설치됨 (없으면 `pip3 install --user websocket-client`)

iframe target은 url substring으로 식별 (기본: awsapnortheast).
환경변수 `SIS_IFRAME_HINT`로 다른 substring 지정 가능.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.request
from typing import Any

try:
    import websocket
except ModuleNotFoundError:
    print(
        "ERROR: websocket-client not installed. Run:\n"
        "  pip3 install --user websocket-client",
        file=sys.stderr,
    )
    sys.exit(2)

CDP_HOST = os.environ.get("CDP_HOST", "http://localhost:9310")
IFRAME_HINT = os.environ.get("SIS_IFRAME_HINT", "awsapnortheast")


def find_iframe() -> dict[str, Any] | None:
    with urllib.request.urlopen(f"{CDP_HOST}/json") as r:
        targets = json.load(r)
    for t in targets:
        if t.get("type") == "iframe" and IFRAME_HINT in t.get("url", ""):
            return t
    return None


class CDPSession:
    def __init__(self, ws_url: str) -> None:
        self.ws = websocket.create_connection(ws_url, timeout=15)
        self.msg_id = 0

    def call(self, method: str, params: dict | None = None) -> dict:
        self.msg_id += 1
        self.ws.send(
            json.dumps({"id": self.msg_id, "method": method, "params": params or {}})
        )
        while True:
            resp = json.loads(self.ws.recv())
            if resp.get("id") == self.msg_id:
                return resp

    def evaluate(self, expression: str) -> Any:
        resp = self.call(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": False},
        )
        result = resp.get("result", {}).get("result", {})
        if result.get("type") == "string":
            try:
                return json.loads(result.get("value", "null"))
            except json.JSONDecodeError:
                return result.get("value")
        return result.get("value")

    def click(self, x: int, y: int) -> None:
        for evt in ("mousePressed", "mouseReleased"):
            self.call(
                "Input.dispatchMouseEvent",
                {"type": evt, "x": x, "y": y, "button": "left", "clickCount": 1},
            )

    def close(self) -> None:
        try:
            self.ws.close()
        except Exception:
            pass


def get_session() -> CDPSession:
    target = find_iframe()
    if not target:
        print(
            f"ERROR: SiS iframe target not found (hint='{IFRAME_HINT}'). "
            "Make sure chromux is running and SiS app is loaded.",
            file=sys.stderr,
        )
        sys.exit(3)
    return CDPSession(target["webSocketDebuggerUrl"])


# ---------- Sub-commands ----------


def cmd_find() -> int:
    target = find_iframe()
    if not target:
        print(json.dumps({"found": False, "hint": IFRAME_HINT}))
        return 1
    print(
        json.dumps(
            {
                "found": True,
                "url": target.get("url", "")[:120],
                "ws": target.get("webSocketDebuggerUrl", ""),
                "id": target.get("id", ""),
            },
            indent=2,
        )
    )
    return 0


def cmd_buttons() -> int:
    s = get_session()
    expr = """
    (() => {
        const result = Array.from(document.querySelectorAll('button')).map(b => {
            const r = b.getBoundingClientRect();
            return {
                text: (b.innerText || b.textContent || '').trim().slice(0, 40),
                cx: Math.round(r.x + r.width / 2),
                cy: Math.round(r.y + r.height / 2),
                w: Math.round(r.width),
                h: Math.round(r.height),
                visible: r.width > 0 && r.height > 0
            };
        });
        return JSON.stringify({
            count: result.length,
            innerW: window.innerWidth,
            innerH: window.innerHeight,
            buttons: result
        });
    })()
    """
    data = s.evaluate(expr)
    s.close()
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0


def cmd_query(selector: str) -> int:
    s = get_session()
    safe = json.dumps(selector)
    expr = f"""
    (() => {{
        const els = Array.from(document.querySelectorAll({safe}));
        return JSON.stringify({{
            selector: {safe},
            count: els.length,
            items: els.slice(0, 10).map(e => {{
                const r = e.getBoundingClientRect();
                return {{
                    text: (e.innerText || e.textContent || '').trim().slice(0, 80),
                    cx: Math.round(r.x + r.width/2),
                    cy: Math.round(r.y + r.height/2),
                    w: Math.round(r.width),
                    h: Math.round(r.height),
                    tag: e.tagName
                }};
            }})
        }});
    }})()
    """
    data = s.evaluate(expr)
    s.close()
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0 if data and data.get("count", 0) > 0 else 1


def cmd_click(x: int, y: int) -> int:
    s = get_session()
    s.click(x, y)
    s.close()
    print(json.dumps({"clicked": [x, y]}))
    return 0


def cmd_scroll(px: int, container: str = "section.main") -> int:
    s = get_session()
    safe = json.dumps(container)
    expr = f"""
    (() => {{
        const el = document.querySelector({safe});
        if (!el) return JSON.stringify({{error: 'container not found', selector: {safe}}});
        el.scrollTop = {px};
        return JSON.stringify({{
            container: {safe},
            scrollTop: el.scrollTop,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight
        }});
    }})()
    """
    data = s.evaluate(expr)
    s.close()
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0 if data and "error" not in data else 1


def cmd_text_contains(substr: str) -> int:
    s = get_session()
    safe = json.dumps(substr)
    expr = f"(document.body.innerText || '').includes({safe})"
    found = s.evaluate(expr)
    s.close()
    print(json.dumps({"substr": substr, "found": bool(found)}))
    return 0 if found else 1


def cmd_errors() -> int:
    """진짜 에러만 카운트.

    Streamlit의 .stAlert는 success/info/warning/error 모두 사용하므로
    클래스만으로는 구분 안 된다 (내부 hash class). 텍스트 휴리스틱으로
    error/warning만 추려낸다.

    카운트 대상:
      - .stException — 무조건 에러 (Python traceback)
      - .stAlert with error keyword in text — 에러 메시지
    카운트 제외:
      - .stAlert with success/info content (한국어 본문, 긍정 텍스트)
    """
    s = get_session()
    expr = """
    (() => {
        const ERROR_KEYWORDS = [
            '실패', '에러', '오류', '예외', '불러올 수 없',
            '없습니다:', '부족합니다',
            'Error', 'Exception', 'Failed', 'TypeError',
            'KeyError', 'ValueError', 'Traceback'
        ];
        const all = [];

        // 1) .stException — 무조건 에러
        for (const el of document.querySelectorAll('.stException')) {
            all.push({
                kind: 'exception',
                text: (el.innerText || '').trim().slice(0, 200)
            });
        }

        // 2) .stAlert — text 휴리스틱
        for (const el of document.querySelectorAll('.stAlert')) {
            const text = (el.innerText || '').trim();
            const isError = ERROR_KEYWORDS.some(kw => text.includes(kw));
            if (isError) {
                all.push({
                    kind: 'alert-error',
                    text: text.slice(0, 200)
                });
            }
        }

        return JSON.stringify({count: all.length, items: all});
    })()
    """
    data = s.evaluate(expr)
    s.close()
    print(json.dumps(data, indent=2, ensure_ascii=False))
    return 0 if data and data.get("count", 0) == 0 else 1


# ---------- Main ----------


USAGE = """\
sis-verifier CDP helper

Usage:
  cdp_helper.py find
  cdp_helper.py buttons
  cdp_helper.py query <css-selector>
  cdp_helper.py click <x> <y>
  cdp_helper.py scroll <px> [container-selector]
  cdp_helper.py text-contains <substring>
  cdp_helper.py errors

Env:
  CDP_HOST          (default: http://localhost:9310)
  SIS_IFRAME_HINT   substring of iframe url (default: awsapnortheast)

Exit codes:
  0  success / found / no errors
  1  not found / errors detected
  2  missing dependency
  3  iframe target not found
"""


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(USAGE, file=sys.stderr)
        return 1
    cmd = argv[1]
    args = argv[2:]
    try:
        if cmd == "find":
            return cmd_find()
        if cmd == "buttons":
            return cmd_buttons()
        if cmd == "query":
            if not args:
                print("query needs a selector", file=sys.stderr)
                return 1
            return cmd_query(args[0])
        if cmd == "click":
            if len(args) < 2:
                print("click needs x and y", file=sys.stderr)
                return 1
            return cmd_click(int(args[0]), int(args[1]))
        if cmd == "scroll":
            if not args:
                print("scroll needs px", file=sys.stderr)
                return 1
            container = args[1] if len(args) > 1 else "section.main"
            return cmd_scroll(int(args[0]), container)
        if cmd == "text-contains":
            if not args:
                print("text-contains needs a substring", file=sys.stderr)
                return 1
            return cmd_text_contains(args[0])
        if cmd == "errors":
            return cmd_errors()
        print(USAGE, file=sys.stderr)
        return 1
    except Exception as e:
        print(f"ERROR: {type(e).__name__}: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
