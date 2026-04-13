---
name: sis-verifier
description: Verify Streamlit in Snowflake (SiS) app deployment automatically by attaching to chromux's CDP port and driving the cross-origin iframe directly. Use after `snow streamlit deploy` succeeds, BEFORE asking the user to confirm. Detects render errors, exercises buttons via CDP, scrolls iframe content, and validates each checkpoint with screenshots.
---

# sis-verifier

자동화된 SiS(Streamlit in Snowflake) 앱 검증 스킬. 배포 후 사용자에게 "확인해주세요" 라고 묻기 **전에** 호출한다.

## When to Use

호출 트리거 (앞 조건 모두 만족):
- `snow streamlit deploy` 또는 동등한 SiS 배포 명령이 성공
- 검증할 데모 시나리오가 명확함 (예: 입력값, 클릭할 버튼, 확인할 결과 영역)
- chromux가 사용 중인 Chrome 프로필에 Snowflake 로그인 상태가 유지됨

호출하지 말 것:
- 일반 웹앱 (SiS 아닌 Streamlit) — 그건 일반 chromux로 충분
- 로그인 화면 자체 검증 — `logged-in-browser-research` 사용
- 사용자가 이미 브라우저에서 직접 확인 중

## Why this skill exists

SiS 앱은 cross-origin iframe (`*.awsapnortheast2.snowflake.app`) 안에서 동작한다. 부모 페이지 입장에서는 iframe 안의 DOM이 차단되므로 chromux의 표준 `click @ref`/`fill @ref`로는 인터랙션 불가. 시행착오로 ~30분 잃은 패턴들:

- ❌ `iframe.contentDocument` JS 접근 → cross-origin block
- ❌ Tab 키 네비게이션 → iframe 자체에는 포커스 잡히지만 안쪽 전파 안 됨
- ❌ cliclick 좌표 클릭 → AppleScript 권한 + Chrome window OS 좌표 변환 문제
- ❌ chromux snapshot @ref → iframe 안쪽은 `presentation` 노드만 노출

**해결책**: CDP가 각 cross-origin iframe을 별개 target으로 노출한다. iframe target에 직접 WebSocket attach하면 same-origin 환경이 되어 모든 CDP 명령이 동작한다.

## Protocol (CP0~CP7)

| CP | 항목 | 자동 가능 | 검증 방법 |
|----|------|----------|----------|
| CP0 | 앱 로드 (페이지 200, 타이틀 일치) | ✅ | `chromux open` + `chromux snapshot` 타이틀 확인 |
| CP1 | 입력 폼 렌더 + 에러 배너 0개 | ✅ | screenshot + iframe DOM에서 `[role="alert"]` count |
| CP2 | 메인 액션 버튼 클릭 | ✅ | CDP `Input.dispatchMouseEvent` (iframe target에 attach) |
| CP3 | 결과 영역 1단 렌더 (예: 추천 리스트) | ✅ | scroll + screenshot + DOM count |
| CP4 | 선택 가능한 항목 클릭 | ✅ | CDP click 동일 방법 |
| CP5 | 결과 영역 2단 렌더 (예: 차트) | ✅ | scroll + screenshot |
| CP6 | LLM/외부 호출 결과 (한국어 텍스트 등) | ✅ | iframe DOM에서 결과 텍스트 substring 검증 |
| CP7 | 보조 입력칸 (Mini-Agent 등) 렌더 | ✅ | scroll + DOM 검증 |

각 체크포인트는 helper 스크립트의 sub-command로 호출한다.

## Workflow

1. **세션 준비**
   - `chromux launch default` 로 Chrome 띄우기 (이미 running이면 idempotent)
   - `chromux open <session-name> <app-url>` 로 SiS 앱 열기
   - `chromux wait <session-name> 8000` (SiS iframe 로드 시간 확보)

2. **CDP iframe target 발견**
   - `cdp_helper.py find` — `http://localhost:9310/json` 에서 type=iframe + url에 `awsapnortheast` 포함된 target 찾기
   - 없으면: 추가 wait → 그래도 없으면 SiS가 로드 안 된 것 → CP0 FAIL 보고

3. **CP0+CP1 (자동)**
   - `chromux screenshot <session>` + 시각 확인
   - `cdp_helper.py inspect` — iframe 안 버튼/입력 요소 좌표 측정 + DOM 카운트
   - `cdp_helper.py errors` — 에러 배너 (`.stAlert`, `[role="alert"]`) 카운트

4. **CP2~CP7 (자동)**
   - **버튼 클릭**: `cdp_helper.py inspect` 로 좌표 측정 → `cdp_helper.py click <x> <y>` 로 클릭
   - **결과 대기**: 처리 시간 (Forecast/LLM 등 무거운 호출은 ~30s) sleep 후 screenshot
   - **스크롤**: SiS는 `section.main` 이 scroll 컨테이너. `cdp_helper.py scroll <px>` 로 scrollTop 설정
   - **DOM 검증**: `cdp_helper.py inspect <selector>` 로 특정 element 존재 확인

5. **실패 시**
   - 1~2회 자체 수정 시도 (좌표 빗나감 → 다시 inspect → 정확한 좌표로 click)
   - 그래도 실패 → 시도 이력과 마지막 screenshot을 첨부해 사용자 보고
   - `findings.md` 또는 동등한 발견 로그에 패턴 추가

## Helper script

`cdp_helper.py` — 이 스킬 디렉토리에 동봉. 사용 예:

```bash
# iframe 발견
python3 ~/.claude/skills/sis-verifier/cdp_helper.py find

# iframe 안 모든 버튼 좌표 측정
python3 ~/.claude/skills/sis-verifier/cdp_helper.py buttons

# 좌표로 클릭
python3 ~/.claude/skills/sis-verifier/cdp_helper.py click 724 473

# 임의 selector로 element 좌표/존재 확인
python3 ~/.claude/skills/sis-verifier/cdp_helper.py query "section.main h2"

# section.main 스크롤
python3 ~/.claude/skills/sis-verifier/cdp_helper.py scroll 800

# DOM 텍스트 검증
python3 ~/.claude/skills/sis-verifier/cdp_helper.py text-contains "AI 분석 요약"
```

helper는 chromux 9310 포트의 CDP에 자동 attach. iframe target은 url substring으로 식별 (기본: `awsapnortheast`).

## Dependencies

- `chromux` (이미 사용 중인 환경 전제)
- Python 3 + `websocket-client` — 없으면 `pip3 install --user websocket-client` (system pip은 `--break-system-packages` 옵션 없음)

## Gotchas (재발견 비용 절감)

| 함정 | 증상 | 회피 |
|---|---|---|
| 부모 page WS에 click dispatch | dispatch는 OK 응답이지만 hit-test 실패 (UI 변화 없음) | iframe target의 WS에 attach해야 함 |
| iframe-local 좌표 ≠ viewport 좌표 | 좌표 빗나감 | `Runtime.evaluate`로 element rect 직접 측정 |
| `window.scrollTo` 가 안 먹힘 | scrollY=0 그대로 | Streamlit은 `section.main` 이 scroll 컨테이너 — 그것의 scrollTop 설정 |
| `pip3 install websocket-client` 가 audit만 함 | ImportError 지속 | `--user` 플래그 + `--quiet` |
| `cliclick` 좌표 변환 시도 | 시간 낭비 | 사용 금지. CDP가 더 깔끔 |
| chromux snapshot에 iframe 내부 안 보임 | `presentation` 노드만 | 정상. iframe target에 직접 attach하면 됨 |
| cross-origin iframe target 못 찾음 | `find` 결과 빈 배열 | URL substring 다를 수 있음 (region별). 기본 `awsapnortheast`, 필요 시 인자 변경 |
| 처음 클릭이 빗나감 (좌표 추정 오차) | UI 변화 없음 | inspect로 측정한 정확한 좌표 사용 — 추정 (686,438) → 측정 (724,473), 38px 오차 |

## Output expectations

이 스킬을 호출한 부모 컨텍스트는 다음을 받는다:

```markdown
## SiS Verification Report
- App URL: ...
- Status: PASS / FAIL
- Checkpoints:
  - CP0 ✅ load
  - CP1 ✅ form rendered, 0 errors
  - CP2 ✅ click main action
  - CP3 ✅ Step1 result rendered (5 items)
  - ...
- Screenshots: /tmp/sis_*.png
- Issues: [if any]
- Next: [user action needed / proceed to next phase]
```

## Lifecycle

이 스킬은 한 세션에서 여러 번 호출 가능 (재배포 후 재검증). 매번 새 chromux session 이름을 사용하지 말고 같은 이름 재사용 권장 (`verify` 같은 단순 이름).

## References

- `references/protocol.md` — 체크포인트 상세 + 데모 시나리오 예시
- `references/troubleshooting.md` — 알려진 실패 패턴 + 해결법
