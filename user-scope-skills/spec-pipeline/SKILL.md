---
name: spec-pipeline
description: >
  3단계 기획 파이프라인을 순차 실행한다: spec-interview → spec-generator → spec-reviewer.
  전체 파이프라인을 한 번에 돌리거나, 특정 단계부터 시작할 수 있다.
  제품별 도메인 knowledge + 코드베이스 요약을 context로 주입하여 산출물 quality를 높인다.
  Triggers: "기획 파이프라인", "spec pipeline", "기획 전체 프로세스",
  "요구사항부터 리뷰까지", "spec 전체", "기획서 처음부터"
allowed-tools: "AskUserQuestion, Write, Read, Glob, Grep, Skill"
---

# Spec Pipeline

3개 스킬을 순차 실행하는 오케스트레이터. 각 단계의 산출물이 다음 단계의 입력이 된다.
제품별 knowledge context를 주입하여 도메인에 맞는 고품질 산출물을 생성한다.

```
[Product Context Loading] → domain.md + codebase-summary.md 로드
     ↓
spec-interview → specs/{slug}-requirements.md
     ↓
spec-generator → specs/{slug}-spec.md
     ↓
spec-reviewer  → specs/{slug}-review.md (PASS/FAIL)
```

## When to Use

- 기능 아이디어를 처음부터 개발 Ready까지 한 번에 진행하고 싶을 때
- "이 기능 기획서 만들어줘"처럼 전체 프로세스가 필요할 때

**Do NOT use when:**
- 이미 요구사항이 정리되어 있음 → `/spec-generator`부터 시작
- 이미 기획서가 있고 리뷰만 필요 → `/spec-reviewer`만 실행
- 개발 스펙이 필요 → `/interview` 사용

## CRITICAL: 하위 스킬 호출 시 턴 분리 규칙

**Skill tool로 하위 스킬을 로드한 직후 같은 턴에서 AskUserQuestion을 호출하지 마세요.**

하위 스킬(spec-interview, spec-generator, spec-reviewer)은 각자 로드 직후 준비 단계를 완료하고 텍스트를 출력한 뒤 STOP합니다. 이 동작이 각 스킬의 CRITICAL 규칙에 명시되어 있습니다.

**오케스트레이터로서 올바른 흐름:**
1. Skill tool로 하위 스킬을 로드한다
2. 하위 스킬이 준비 완료 텍스트를 출력하고 STOP한다
3. 사용자가 응답한다
4. 하위 스킬이 다음 턴에서 AskUserQuestion을 포함한 본 작업을 수행한다
5. 하위 스킬이 산출물을 생성하고 완료된다
6. spec-pipeline이 다음 Stage로 전환 안내를 출력한다

**금지 패턴:**
- Skill tool 호출과 같은 응답 안에서 AskUserQuestion을 호출하는 것
- 하위 스킬의 STOP을 우회하도록 "빨리 진행해줘"를 덧붙이는 것

## Protocol

### Stage 0: 제품 Context 로딩 + 시작점 결정

#### 0-A. 제품 Context 로딩

사용자 input에서 제품을 식별하고 knowledge context를 로드한다. **시작점 결정(0-B)보다 먼저 수행한다** — 제품 식별 결과로 slug를 확정해야 기존 산출물 존재 여부를 정확히 판단할 수 있다.

**Step 1: 레지스트리 읽기**
- `~/.claude/skills/spec-pipeline/products/_registry.md`를 Read tool로 읽는다
- 등록된 제품 테이블에서 키워드 목록을 파싱한다

**Step 2: 제품 식별 (자동 + 확인)**
- 사용자 input의 키워드를 레지스트리와 매칭한다
- 단일 매칭 → 텍스트로 안내: "**{제품명}** 관련 기획으로 진행합니다." (별도 확인 질문 없이 진행. 사용자가 정정하면 그때 변경)
- 복수 매칭 → AskUserQuestion으로 제품 선택
- 매칭 없음 → "등록된 제품 context 없이 진행합니다" (범용 모드)

**Step 3: Context 로드**
- Read tool로 `~/.claude/skills/spec-pipeline/products/{id}/domain.md` **전체**를 읽는다 (Tier 1)
- Read tool로 `~/.claude/skills/spec-pipeline/products/{id}/codebase-summary.md` **전체**를 읽는다 (Tier 2)
- 두 파일 모두 한 번에 읽어서 대화 컨텍스트에 로드한다. 파일 크기가 작으므로 (~500 + ~2K 토큰) 부분 로드 불필요.

**Step 4: Context 전달 방식**
- 로드된 context는 **대화 컨텍스트에 자동으로 포함**된다. Skill tool로 하위 스킬을 호출하면 같은 대화 내에서 실행되므로, 하위 스킬이 이미 로드된 context를 자연스럽게 참조한다.
- 별도의 인자 전달이나 파일 경로 주입은 불필요하다.

**제품 미등록 시**: context 없이 범용 모드로 동작 (기존과 동일)

#### 0-B. 시작점 결정

사용자의 input과 기존 산출물을 분석하여 시작점을 결정한다:

| 상황 | 시작점 |
|------|--------|
| Input 없음 또는 모호한 아이디어 | Stage 1 (spec-interview) |
| `specs/{slug}-requirements.md` 존재 | Stage 2 (spec-generator) |
| `specs/{slug}-spec.md` 존재 | Stage 3 (spec-reviewer) |
| 사용자가 명시적으로 단계 지정 | 해당 단계 |

시작점을 사용자에게 알린다:
"[Stage N]부터 시작합니다. 전체 파이프라인: interview → generator → reviewer"

인자가 있으면 파싱한다:
- `from:interview` 또는 `from:1` → Stage 1부터
- `from:generator` 또는 `from:2` → Stage 2부터
- `from:reviewer` 또는 `from:3` → Stage 3부터
- 인자 없음 → 자동 판단 (위 표 기준)

### Stage 1: spec-interview

Skill tool로 `spec-interview`를 실행한다.

**완료 조건**: `specs/{slug}-requirements.md` 파일이 생성됨.

**Stage 1 → 2 전환 안내**:
"요구사항이 정리되었습니다. 이어서 기획서를 생성하겠습니다."

### Stage 2: spec-generator

Skill tool로 `spec-generator`를 실행한다.
- Stage 1에서 생성된 requirements 파일을 자동으로 입력으로 사용

**완료 조건**: `specs/{slug}-spec.md` 파일이 생성됨.

**Stage 2 → 3 전환 안내**:
"기획서가 작성되었습니다. 이어서 개발 Ready 검증을 진행하겠습니다."

### Stage 3: spec-reviewer

Skill tool로 `spec-reviewer`를 실행한다.
- Stage 2에서 생성된 spec 파일을 자동으로 입력으로 사용

**완료 조건**: `specs/{slug}-review.md` 파일이 생성되고 PASS/FAIL 판정이 내려짐.

### Stage 4: 최종 안내

**PASS인 경우:**
```text
파이프라인 완료!

산출물:
- 요구사항: specs/{slug}-requirements.md
- 기획서:   specs/{slug}-spec.md
- 리뷰:     specs/{slug}-review.md → PASS

개발 Ready입니다. `/interview`로 개발 스펙을 작성하면 됩니다.
```

**FAIL인 경우:**
```text
파이프라인 완료 (리뷰 FAIL)

산출물:
- 요구사항: specs/{slug}-requirements.md
- 기획서:   specs/{slug}-spec.md
- 리뷰:     specs/{slug}-review.md → FAIL (Critical N개)

Critical 항목을 해소한 후:
- 기획서 수정 → `/spec-generator`로 재생성
- 리뷰 재실행 → `/spec-reviewer`
```

## Confidence Gate (Stage 전환 게이트)

각 Stage 완료 후, 산출물의 품질을 0-100 점수로 평가하여 다음 Stage 진행 여부를 결정한다.
저품질 산출물이 다음 Stage로 흘러가면 전체 파이프라인 품질이 붕괴하기 때문이다.

### 평가 기준

**Stage 1 → 2 게이트** (requirements → generator):
| 항목 | 가중치 | 체크 |
|------|--------|------|
| 핵심 요구사항 구체성 | 30% | "~해야 한다" 수준이 아닌, 구체적 시나리오/데이터가 있는가 |
| 미결 사항 비율 | 25% | 미결 사항이 전체 항목의 30% 이하인가 |
| 정책 결정 완료도 | 25% | 삭제/동시성/권한 등 핵심 정책이 결정되었는가 |
| 범위 명확성 | 20% | "하는 것/안 하는 것"이 명시되어 있는가 |

**Stage 2 → 3 게이트** (generator → reviewer):
| 항목 | 가중치 | 체크 |
|------|--------|------|
| 8개 섹션 커버리지 | 30% | "없음" 섹션이 0개인가 |
| [추정] 비율 | 25% | [추정] 항목이 전체의 25% 이하인가 |
| 시나리오 완전성 | 25% | 정상 흐름 + 예외 흐름이 있는가 |
| 데이터 모델 명확성 | 20% | 필드/타입/제약이 정의되어 있는가 |

### 게이트 판정

| Confidence | 판정 | 행동 |
|-----------|------|------|
| 80-100 | **PROCEED** | 자동으로 다음 Stage 진행 |
| 50-79 | **WARN** | 사용자에게 경고 + 진행 여부 질문 |
| 0-49 | **BLOCK** | 다음 Stage 진행 불가, 현재 Stage 보완 필요 |

### 게이트 출력 형식

```markdown
## Stage Gate: Stage {N} → Stage {N+1}

**Confidence**: {점수}/100
**Decision**: {PROCEED / WARN / BLOCK}

| 항목 | 점수 | 비고 |
|------|------|------|
| {항목1} | {점수}/30 | {설명} |
| {항목2} | {점수}/25 | {설명} |
| ... | ... | ... |

{WARN인 경우}
**주의사항**: {왜 점수가 낮은지 설명}
→ 진행하시겠습니까? (진행 / 보완 후 재시도)

{BLOCK인 경우}
**차단 사유**: {구체적 사유}
→ {보완해야 할 항목 목록}
```

### Stage 전환 안내 수정

기존의 간단한 전환 안내 대신, Confidence Gate 결과를 포함한다:

**Stage 1 → 2**:
```
요구사항이 정리되었습니다.

## Stage Gate: Stage 1 → Stage 2
Confidence: {점수}/100 → {PROCEED/WARN/BLOCK}
{게이트 상세 테이블}

{PROCEED면} 이어서 기획서를 생성하겠습니다.
{WARN이면} 진행하시겠습니까?
{BLOCK이면} 보완이 필요합니다: {항목}
```

---

## 단계 간 데이터 흐름

| 흐름 | 전달 데이터 | 메커니즘 |
|------|------------|----------|
| Stage 0 → 전 단계 | 도메인 knowledge + 코드베이스 요약 | `~/.claude/skills/spec-pipeline/products/{id}/domain.md` + `codebase-summary.md` → 대화 컨텍스트로 전달 |
| interview → generator | 요구사항 + 정책 결정 + 미결 사항 | `specs/{slug}-requirements.md` 파일 |
| generator → reviewer | 기획서 (8개 섹션) + [추정] 마크 | `specs/{slug}-spec.md` 파일 |
| reviewer → 사용자 | PASS/FAIL + 질문 목록 | `specs/{slug}-review.md` 파일 |

**slug 일관성**: 파이프라인 전체에서 동일한 slug를 사용한다. Stage 1부터 시작하면 interview에서 결정된 slug를 사용하고, Stage 2/3부터 시작하면 기존 파일명에서 추출한다 (예: `specs/notification-requirements.md` → slug = `notification`).

## 중단과 재개

- 사용자가 중간에 중단하면, 이미 생성된 산출물은 유지된다
- 다음 세션에서 `/spec-pipeline`을 다시 실행하면, Stage 0에서 기존 산출물을 감지하여 이어서 진행한다
- 사용자가 "처음부터"라고 하면 Stage 1부터 재시작한다

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| 3개 스킬을 동시에 실행 | **순차 실행** — 이전 단계 완료 후 다음 진행 |
| 단계 전환 시 사용자 안내 없이 진행 | 각 전환점에서 진행 상황 안내 |
| slug가 단계마다 달라짐 | Stage 1의 slug를 전체 파이프라인에서 유지 |
| FAIL 후 자동으로 재시작 | 사용자에게 선택지 제공 (수정 후 재실행 or 종료) |
| Skill tool 호출 후 같은 턴에서 AskUserQuestion 호출 | 하위 스킬이 STOP할 때까지 기다린 후 다음 턴에서 진행 |
| 제품 context 없이 진행 | Stage 0-B에서 레지스트리를 반드시 확인 (미등록이면 범용 모드 안내) |
| context를 전체 로드하여 토큰 낭비 | domain.md + codebase-summary.md 두 파일만 로드 (~2.5K 토큰). 추가 파일 필요 시 on-demand |
| 0-A에서 제품 식별 전에 시작점 결정 시도 | **0-A(제품 식별) → 0-B(시작점 결정)** 순서 엄수. slug 확정 후 산출물 확인 |

## Red Flags — STOP and Reassess

- Stage 1 없이 Stage 2를 시작하려는데 requirements 파일이 없음
- Stage 2 없이 Stage 3을 시작하려는데 spec 파일이 없음
- 각 스킬의 Red Flag 조건이 발생 (각 SKILL.md 참조)
- 사용자가 파이프라인 중간에 다른 기능으로 전환
