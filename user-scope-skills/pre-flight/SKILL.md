---
name: pre-flight
description: |
  CLAUDE.md 기반 환경 안전 체크. 작업 시작 전에 프로젝트의 안전 규칙, 컨벤션,
  환경 설정을 자동 검증하여 CLEAR/WARNING/BLOCKED 상태를 보고한다.
  /check가 "변경 후 검증"이라면, /pre-flight는 "작업 전 환경 검증"이다.
  Use PROACTIVELY before starting work, especially after switching branches,
  pulling changes, or resuming a session. Also use when explicitly asked:
  "/pre-flight", "프리플라이트", "환경 체크", "작업 전 점검",
  "안전 체크", "environment check", "pre-flight check",
  "시작해도 돼?", "환경 괜찮아?", "safety check",
  "DB 확인", "설정 확인", "config check".
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# /pre-flight — CLAUDE.md 기반 환경 안전 체크

작업을 시작하기 전에 CLAUDE.md에 명시된 안전 규칙과 환경 설정을 자동으로 검증한다.
위반 사항이 있으면 작업을 시작하지 않도록 경고한다.

## Why This Exists

프로젝트마다 "절대 하면 안 되는 것"이 있다. dev DB에서 pytest를 돌리면 안 되고,
main 브랜치에서 직접 작업하면 안 되고, 특정 config가 잘못되면 안 된다.
이런 규칙은 CLAUDE.md에 적혀 있지만, 매번 사람이 확인하기엔 놓치기 쉽다.

이 스킬은 CLAUDE.md를 파싱하여 안전 규칙을 추출하고, 현재 환경 상태와
대조하여 위반 여부를 자동으로 보고한다.

## When to Use

| 상황 | 사용? |
|------|------|
| 세션 시작 시 | YES — 환경이 안전한지 확인 |
| 브랜치 전환 후 | YES — 새 브랜치에서 config 상태 확인 |
| pull/merge 후 | YES — 새 코드가 환경 요구사항을 바꿨을 수 있음 |
| 테스트 실행 전 | YES — DB 설정이 안전한지 확인 |
| 일반 코드 작성 중 | No — 과도한 사용은 불필요 |

## Step 1: CLAUDE.md 파싱

프로젝트의 CLAUDE.md를 읽고 안전 규칙을 추출한다.

### 규칙 추출 기준

다음 패턴을 포함하는 섹션에서 규칙을 추출한다:
- `IMPORTANT` (대문자)
- `안전`, `safety`, `절대`, `금지`, `반드시`
- `사고 이력`, `incident`
- 환경 설정 관련: `cfg`, `config`, `환경`, `DB`, `host`

### 추출 결과 구조화

각 규칙을 다음 형태로 구조화:
```
Rule: {규칙 내용}
Check: {검증 방법}
Severity: BLOCK / WARN
```

**Severity 기준:**
- **BLOCK**: "절대", "금지", "IMPORTANT", 사고 이력이 있는 규칙 → 위반 시 작업 중단 권고
- **WARN**: "권장", "주의", 컨벤션 관련 → 위반 시 경고만

---

## Step 2: 환경 체크 실행

추출된 규칙에 따라 실제 환경을 검증한다. 검증은 **읽기 전용** — 아무것도 수정하지 않는다.

### 공통 체크 항목 (CLAUDE.md에서 해당 규칙 발견 시)

| 체크 | 방법 | 기대값 |
|------|------|--------|
| DB Host | config 파일에서 PSQL_HOST/DB_HOST 읽기 | localhost, 127.0.0.1 |
| 브랜치 이름 | `git branch --show-current` | CLAUDE.md의 브랜치 네이밍 규칙 매치 |
| 현재 브랜치 ≠ main | `git branch --show-current` | main/master가 아닐 것 |
| Python 버전 | `python --version` | CLAUDE.md에 명시된 버전 |
| Config 파일 gitignore | `.gitignore` 확인 | 민감 config가 ignore 되어 있을 것 |
| 필수 서비스 | `redis-cli ping`, `rabbitmqctl status` 등 | CLAUDE.md에 명시된 서비스가 실행 중 |

### 동적 체크 (CLAUDE.md 내용에 따라)

CLAUDE.md에서 추출한 규칙 중 환경 검증이 가능한 것은 모두 체크한다.
예를 들어:
- "pytest는 localhost DB에서만" → config 파일에서 DB host 확인
- "Python 3.10만 지원" → python --version 확인
- "develop에서 분기" → git log로 base branch 확인

**체크할 수 없는 규칙** (예: "코드 리뷰 후 머지")은 INFO로 표시만 한다.

---

## Step 3: 결과 보고

### 상태 결정

| 조건 | 상태 |
|------|------|
| BLOCK 위반 0건, WARN 위반 0건 | **CLEAR** |
| BLOCK 위반 0건, WARN 위반 1건+ | **WARNING** |
| BLOCK 위반 1건+ | **BLOCKED** |

### 출력 형식

```markdown
## Pre-flight Check: {프로젝트명}

**Status**: {CLEAR / WARNING / BLOCKED}
**Date**: {YYYY-MM-DD HH:MM}
**Rules extracted**: {N}개 from CLAUDE.md

### Results

| # | Rule | Check | Result | Severity |
|---|------|-------|--------|----------|
| 1 | DB는 localhost만 | PSQL_HOST=localhost | PASS | BLOCK |
| 2 | 브랜치 네이밍 | feature/DPT-1234-... | PASS | WARN |
| 3 | Python 3.10 | python 3.10.15 | PASS | WARN |

### {BLOCKED인 경우}
**작업을 시작하기 전에 다음을 해결하세요:**
1. {BLOCK 위반 항목 + 해결 방법}

### {WARNING인 경우}
**다음 사항을 참고하세요:**
1. {WARN 위반 항목 + 권고사항}

### {CLEAR인 경우}
환경이 안전합니다. 작업을 시작하세요.
```

---

## Checklist Before Stopping

- [ ] CLAUDE.md를 읽고 안전 규칙을 추출했는가
- [ ] 추출된 각 규칙에 대해 환경 체크를 실행했는가
- [ ] BLOCK/WARN/PASS로 각 체크 결과를 분류했는가
- [ ] 최종 상태(CLEAR/WARNING/BLOCKED)를 정확히 산출했는가
- [ ] BLOCKED 항목에 해결 방법을 제시했는가
- [ ] 읽기 전용으로만 동작했는가 (환경 수정 없음)
