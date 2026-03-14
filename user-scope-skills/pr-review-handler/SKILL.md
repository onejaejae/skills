---
name: pr-review-handler
description: >
  PR review comments를 체계적으로 처리하는 skill.
  Use when: (1) PR에 동료의 리뷰가 달렸을 때, (2) 여러 리뷰를 한 번에 처리하고 싶을 때,
  (3) 수정 후 commit 링크가 포함된 reply를 자동으로 추가하고 싶을 때
---

# PR Review Handler

PR에 동료들이 남긴 review comments를 체계적으로 처리하는 workflow입니다.

---

## 사용법

Claude에게 PR 리뷰 처리를 요청합니다:

```
PR 26번 리뷰 처리해줘
```

또는:

```
pr-review-handler 실행해줘 (PR 26번)
```

> **참고**: `/pr-review-handler`는 Claude가 내부적으로 실행하는 skill입니다.
> 사용자가 직접 slash command를 입력하는 것이 아니라, Claude에게 요청하면 됩니다.

---

## 스크립트 경로

이 스킬 로드 시 시스템이 "Base directory for this skill: ..." 메시지를 제공합니다. 이하 `$SKILL_DIR`은 해당 경로를 의미합니다.

---

## Workflow

### Phase 1: Comments 조회

PR의 review threads를 조회합니다.

```bash
# PR 번호, OWNER/REPO 모두 자동 감지 (현재 브랜치 + git repo 기반)
$SKILL_DIR/scripts/get-review-threads.sh

# 또는 명시적으로 지정
$SKILL_DIR/scripts/get-review-threads.sh 46 khc-dp/dp-webhook
```

**출력 형식 (파싱된 요약):**
```
PR_URL: https://github.com/owner/repo/pull/46
PR_TITLE: feat: ...
TOTAL: 18 | RESOLVED: 17 | OUTDATED: 0 | ACTIVE: 1

## SKIPPED
PRRT_xxx	RESOLVED	author	file.py:10	comment preview...

## ACTIVE
PRRT_yyy	ACTIVE	author	file.py:20	1 replies	comment preview...
```

**포함 정보:**
- Thread ID (reply 추가 시 필요)
- 파일 경로, 라인 번호
- 작성자, 내용 미리보기 (150자)
- 상태 (RESOLVED/OUTDATED/ACTIVE)
- Reply 수

---

### Phase 1.5: 자동 필터링

조회된 threads 중 다음 조건에 해당하는 것은 **자동으로 스킵**됩니다:

| 조건 | 이유 | 표시 |
|------|------|------|
| `isResolved: true` | 이미 해결됨 | ✅ Resolved |
| `isOutdated: true` | 코드가 변경됨 (이미 수정 반영됨) | 🔄 Outdated |

**자동 필터링 결과:**
```
📋 PR #26: 총 8개 threads
  ├─ ✅ Resolved: 1개 (자동 스킵)
  ├─ 🔄 Outdated: 0개 (자동 스킵, 코드 변경됨)
  └─ 🔍 검토 필요: 7개
```

---

### Phase 2: Comments 분석 및 분류

각 comment를 분석하여 다음과 같이 분류합니다:

| 분류 | 설명 | 액션 |
|------|------|------|
| **ACCEPT** | 타당한 지적, 수정 필요 | 코드 수정 진행 |
| **DISCUSS** | 논의 필요, 판단 어려움 | 사용자에게 질문 |
| **SKIP** | 이미 처리됨 / 해당 없음 | 건너뛰기 |

**분류 기준:**
- 코드 품질, 버그, 보안 관련 → ACCEPT
- 아키텍처, 설계 방향 관련 → DISCUSS
- 이미 reply가 있거나 resolved → SKIP

---

### Phase 2-1: DISCUSS 항목 처리

DISCUSS로 분류된 각 comment에 대해 사용자에게 질문합니다:
- ACCEPT로 변경하여 수정 진행
- SKIP하여 나중에 논의

---

### Phase 3: 수정 작업

ACCEPT로 확정된 각 comment에 대해:

1. **수정 방향 제안** → 사용자 승인
2. **코드 수정** (Edit tool)
3. **Commit 메시지 제안** → 사용자 승인
4. **개별 commit** (comment 단위)
5. commit SHA 저장

**Commit 메시지 형식:**
```
[TASK-ID] [수정 내용] #patch
```

---

### Phase 4: Reply 추가

수정 완료된 comment에 reply를 추가합니다:

```bash
$SKILL_DIR/scripts/reply-to-thread.sh [THREAD_ID] [BODY]
```

**Reply 형식:**
```
fixed in https://github.com/{owner}/{repo}/pull/{pr}/commits/{sha}
```

---

## 출력 형식

### 분류 결과 테이블

```markdown
## PR #26 Review Comments 분석

📋 총 8개 threads
  ├─ ✅ Resolved: 1개 (자동 스킵)
  ├─ 🔄 Outdated: 0개 (자동 스킵)
  └─ 🔍 검토 필요: 7개

### 자동 스킵
| # | Author | File | Comment | 상태 |
|---|--------|------|---------|------|
| 1 | review-fairy | research_repository.py | filters 타입 힌트... | ✅ Resolved |

### 검토 대상
| # | Author | File | Line | Comment | 분류 |
|---|--------|------|------|---------|------|
| 2 | JISU-JEONG | docker-compose.yml | 1 | p2. 해당 db 세팅... | DISCUSS |
| 3 | JISU-JEONG | base_repository.py | 69 | p2. 불필요한 서브쿼리... | ACCEPT |
| 4 | JISU-JEONG | base_repository.py | 74 | p3. 없으면 raise... | ACCEPT |
| ... | ... | ... | ... | ... | ... |
```

### 수정 완료 요약

```markdown
## 수정 완료 요약

| # | File | Commit | Status |
|---|------|--------|--------|
| 1 | base_repository.py:69 | abc1234 | Fixed |
| 2 | base_repository.py:74 | def5678 | Fixed |
| 3 | docker-compose.yml:1 | - | Skipped |
```

---

## 사용자 인터랙션 포인트

| 시점 | 확인 내용 | 선택지 |
|------|----------|--------|
| Phase 2 후 | 전체 분류 결과 확인 | 진행 / 수정 / 중단 |
| Phase 2-1 | DISCUSS 항목 각각 처리 | ACCEPT / SKIP |
| Phase 3 각 수정 전 | 수정 방향 확인 | 승인 / 수정 제안 |
| Phase 3 각 수정 후 | Commit 메시지 확인 | 승인 / 수정 |
| Phase 4 전 | Reply 추가 확인 | 전체 진행 / 선택적 / 스킵 |

---

## 스크립트 설명

스크립트는 `$SKILL_DIR/scripts/` 에 위치합니다. `$SKILL_DIR`은 이 스킬이 로드될 때 시스템이 주입하는 base directory입니다.

### get-review-threads.sh

```bash
$SKILL_DIR/scripts/get-review-threads.sh [PR_NUMBER] [OWNER/REPO]
```

- PR의 모든 review threads 조회 + **파싱된 요약 출력**
- PR 번호 생략 시: 현재 브랜치의 PR 자동 감지
- OWNER/REPO 생략 시: `gh repo view`로 자동 감지
- 출력: TSV 형식 요약 (Thread ID, 상태, 작성자, 파일:라인, 댓글 미리보기)

### reply-to-thread.sh

```bash
$SKILL_DIR/scripts/reply-to-thread.sh <THREAD_ID> <BODY>
```

- 특정 thread에 reply 추가
- THREAD_ID: `PRRT_...` 형식 (get-review-threads.sh 출력에서 획득)

---

## 주의사항

1. **자동 스킵 (isResolved)**: `isResolved: true`인 thread는 Phase 1.5에서 자동으로 스킵
2. **자동 스킵 (isOutdated)**: `isOutdated: true`인 thread도 자동 스킵 (코드가 이미 변경됨)
3. **권한**: gh CLI 인증 필요 (`gh auth login`)

---

## 예시 세션

```
사용자: PR 26번 리뷰 처리해줘

Claude:
## PR #26 Review Comments 조회 중...

📋 총 8개 threads 발견
  ├─ ✅ Resolved: 1개 (자동 스킵)
  ├─ 🔄 Outdated: 0개 (자동 스킵)
  └─ 🔍 검토 필요: 7개

### 자동 스킵
| # | Author | File | 상태 |
|---|--------|------|------|
| 1 | review-fairy | research_repository.py | ✅ Resolved |

### 검토 대상 분류 결과
| # | Author | File | Line | Comment | 분류 |
|---|--------|------|------|---------|------|
| 2 | JISU-JEONG | docker-compose.yml | 1 | p2. 해당 db 세팅... | DISCUSS |
| 3 | JISU-JEONG | base_repository.py | 69 | p2. 불필요한 서브쿼리... | ACCEPT |
| 4 | JISU-JEONG | base_repository.py | 74 | p3. 없으면 raise... | ACCEPT |
| ... | ... | ... | ... | ... | ... |

> 위 분류로 진행할까요? (진행/수정/중단)

사용자: 진행

[DISCUSS 항목 처리]
[각 수정 진행 - 방향 확인 → 수정 → 커밋]
[Reply 추가]

## 완료!
```
