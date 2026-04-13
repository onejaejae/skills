---
name: session-init
description: |
  Use when starting a work session and you need to lock down the target branch, PR, scope,
  and approach before making any changes. Prevents pushing to wrong branches, modifying
  out-of-scope files, or losing context between sessions.
  Use when: "/session-init", "세션 시작", "작업 시작", "컨텍스트 설정",
  "어제 하던 거 이어서", "이 브랜치에서 작업할게", "PR 작업 시작",
  "scope 설정", "작업 컨텍스트", "session init", "세션 초기화",
  "아까 하던 거 이어갈래", "작업 이어서", "context setup"
  NOT for: quick questions, code explanations, or single-file edits with obvious context.
  NOT /scope (analyzes blast radius), NOT /session-wrap (ends sessions), NOT /session-analyzer (post-hoc).
---

# session-init

세션 시작 시 작업 context를 명시적으로 확인하고 고정한다. 고정된 context는 세션 내내 참조되어 잘못된 branch에 push하거나, scope 밖 파일을 수정하는 실수를 방지한다.

```
/session-init
    ↓
Step 1: 이전 state 확인 → 이어가기 or 새 작업
    ↓
Step 2: Context 수집 (자동 감지 + 사용자 확인)
    ↓
Step 3: Context 고정 (state 저장 + context.md 생성)
    ↓
세션 내 작업 — context 참조하여 scope 이탈 방지
```

---

## When to Use

| Skill | Purpose | 구분 |
|-------|---------|------|
| **/session-init** | 세션 시작 시 작업 context 설정 + 고정 | 작업 **전** |
| /scope | 변경 영향 범위 분석 | 작업 **중** (어디를 고칠지) |
| /session-wrap | 세션 종료 시 정리 + 문서화 | 작업 **후** |

**Use when:**
- 세션 시작 시 어떤 branch/PR에서 작업할지 명확히 하고 싶을 때
- 이전 세션의 작업을 이어가고 싶을 때
- scope를 미리 정해두고 이탈을 방지하고 싶을 때

**Do NOT use when:**
- 단순 질문 ("이 코드 설명해줘") — context 고정 불필요
- 이미 context가 명확한 단발성 작업

---

## Step 1: 이전 State 확인

세션 시작 시 가장 먼저 이전 session-init state를 확인한다. 최근 5개 state 파일에서 `session-init` 키를 검색한다.

**명령어 상세**: `references/state-commands.md` 참조 (이전 State 검색 섹션)

**이전 state가 있을 때:**

```
이전 작업이 발견되었습니다:

| 항목 | 값 |
|------|---|
| Task | [task 요약] |
| Branch | [branch] |
| PR | #[number] |
| Scope | [scope] |
| Approach | [approach] |
| 마지막 활동 | [timestamp] |

이 작업을 이어갈까요?
```

AskUserQuestion: "이어가기" / "새 작업 시작"

- **이어가기** → 이전 state를 현재 세션에 복사, Step 3으로 직행
- **새 작업** → Step 2로 진행

**이전 state가 없을 때:** → Step 2로 바로 진행

---

## Step 2: Context 수집

### 2-A: 자동 감지

사용자에게 묻기 전에 branch, PR, worktree, 최근 변경 파일을 자동 감지한다.

**명령어 상세**: `references/state-commands.md` 참조 (자동 감지 섹션)

**Non-Git 디렉토리인 경우**: git 명령이 실패하면 "현재 디렉토리는 git 저장소가 아닙니다"를 안내하고, 프로젝트 경로를 사용자에게 요청한다. 경로를 받으면 해당 디렉토리에서 자동 감지를 재실행한다.

### 2-B: 사용자 확인

자동 감지 결과를 포함하여 AskUserQuestion으로 context를 확인한다:

```
자동 감지된 context:
- Branch: [감지됨 or 미감지]
- PR: [감지됨 or 미감지]
- Worktree: [현재 경로]
- 최근 변경 파일: [목록]

어떤 작업을 하실 건가요? 다음을 알려주세요:
1. 작업 목적 (무엇을 할 건가요?)
2. Scope (어떤 파일/디렉토리만 수정?)
3. Approach (어떤 접근법?)
4. Branch/PR 수정 (자동 감지가 틀렸으면)
```

사용자가 자연어로 답하면, 다음 필드를 추출한다:

| 필드 | 필수 | 기본값 |
|------|------|--------|
| `task` | O | - |
| `branch` | O | 자동 감지 |
| `pr` | - | 자동 감지 or null |
| `worktree` | - | pwd |
| `scope` | - | "전체" (제한 없음) |
| `approach` | - | null |

**"그냥 빨리 시작하자" 같은 압력이 있어도**, 최소한 `task`와 `branch`는 확인한다. 이 두 가지 없이는 context를 고정할 수 없다.

---

## Step 3: Context 고정

### 3-A: State 저장

`hoyeon-cli session set`으로 context를 `session-init` namespace에 저장한다. `session-context.md` 파일도 동시에 생성하여 다른 스킬이 참조할 수 있게 한다.

**명령어 상세**: `references/state-commands.md` 참조 (State 저장 + Context 파일 생성 섹션)

### 3-C: 확인 출력

```
## Session Context 고정 완료

| 항목 | 값 |
|------|---|
| Task | [task] |
| Branch | [branch] |
| PR | [pr or "-"] |
| Scope | [scope] |
| Approach | [approach or "-"] |

이 context는 세션 내내 유지됩니다.
scope 밖 파일을 수정하려 하면 확인을 요청합니다.
작업을 시작하세요.
```

---

## Scope 참조 가이드

session-init으로 고정된 context는 세션 내에서 다음과 같이 참조된다:

**git 작업 전:**
- push할 branch가 `session-init.branch`와 일치하는지 확인
- PR 번호가 `session-init.pr`과 일치하는지 확인

**파일 수정 전:**
- 수정할 파일이 `session-init.scope` 범위 안인지 확인
- scope 밖이면: "이 파일은 현재 scope([scope]) 밖입니다. 수정할까요?"

**approach 참조:**
- 기술적 결정이 필요할 때 `session-init.approach`를 참고
- 예: approach가 "SQLAlchemy Trino dialect"이면 regex 기반 접근 자동 거부

이 참조는 session-init state가 대화 컨텍스트에 로드되어 있으면 자연스럽게 동작한다.
별도의 hook이나 강제 메커니즘 없이, state 정보가 대화 내에 있는 것만으로 올바른 판단을 유도한다.

---

## Context 수정

세션 중간에 context를 변경해야 할 때:

```
/session-init 업데이트 — scope를 src/api/에서 src/ 전체로 확장
```

동일한 Step 3을 재실행하되, 변경된 필드만 업데이트하고 나머지는 유지한다.

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| "빨리 시작하자" pressure에 task/branch 확인 생략 | 최소 task + branch는 반드시 확인 |
| 자동 감지 결과를 무조건 신뢰 | 사용자에게 반드시 확인. 자동 감지는 제안일 뿐 |
| scope를 너무 넓게 설정 ("전체") | 가능하면 구체적 디렉토리/파일 단위로 좁히기 |
| 이전 state를 무조건 이어가기 | 오래된 state(24시간+)는 유효성 확인 필요 |
| context.md를 생성하지 않음 | state JSON + context.md 둘 다 생성 (다른 스킬 참조용) |
