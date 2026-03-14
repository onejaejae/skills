---
name: multi-model-review
description: Use when reviewing PRs or branches with multiple AI models, cross-validating findings across Claude/Gemini/Codex, or when user says "multi-review", "멀티 모델 리뷰", "다양한 관점에서 코드 리뷰"
---

# Multi-Model Code Review

여러 AI 모델(Claude, Gemini, Codex)을 활용하여 PR을 병렬로 리뷰하고 결과를 종합합니다.

## Triggers

Use this skill when:
- User says "/multi-review", "multi-review", "multi model review"
- User wants to review a PR with multiple AI perspectives
- User asks for "다양한 관점에서 코드 리뷰", "멀티 모델 리뷰"

## Instructions

이 스킬이 트리거되면 다음 단계를 **자동으로** 수행하세요:

### Step 1: 입력 파싱

사용자 입력에서 다음을 추출:
- `PR_URL`: GitHub PR URL (예: https://github.com/org/repo/pull/123)
- `--branch BRANCH`: 로컬 브랜치 이름 (PR URL 대신 사용 가능, `develop` 브랜치 대비 diff)
- `--members MODELS`: 사용할 모델 (기본: claude,gemini,codex)
- `--focus AREAS`: 집중 영역 (기본: all)

**입력이 없는 경우:** PR URL이나 --branch가 없으면 사용자에게 요청하세요:
> "리뷰할 PR URL 또는 로컬 브랜치를 알려주세요. (예: `https://github.com/org/repo/pull/123` 또는 `--branch feature/name`)"

### Step 2: 리뷰 시작

> **참고:** `{{SKILL_DIR}}`은 스킬 프레임워크가 자동으로 실제 경로로 치환합니다. 수동 설정 불필요.

```bash
cd "{{SKILL_DIR}}/scripts"

# PR URL인 경우
./review.sh start "PR_URL" --members claude,gemini,codex

# 브랜치인 경우 (develop 브랜치 대비 diff)
./review.sh start --branch "BRANCH_NAME"
```

**출력 예시:**
```json
{"jobDir":"/path/to/.jobs/review-xxx","jobId":"review-xxx","members":["claude","gemini","codex"],"state":"running"}
```

JSON 출력에서 `jobDir` 값을 파싱하여 다음 단계에서 사용하세요.

### Step 3: 완료 대기

```bash
./review.sh wait "JOB_DIR" --timeout 300
```

### Step 4: 결과 조회 및 출력

`--synthesis` 값은 `review.config.yaml`의 `synthesis.strategy` 설정을 따릅니다 (기본: `ai_merge`).

```bash
./review.sh results "JOB_DIR" --synthesis ai_merge --markdown
```

결과 파일 경로를 사용자에게 안내하세요:

> 📄 **리뷰 결과가 저장되었습니다:**
> `.claude/reviews/REVIEW-{job_id}.md`
>
> 에디터의 마크다운 프리뷰로 확인하세요.

**중요:** 마크다운 파일 전체를 터미널에 출력하지 마세요. 파일 경로를 안내하고 에디터 프리뷰를 권장합니다.

사용자가 에디터를 사용할 수 없는 환경(SSH 등)이면:
> `cat .claude/reviews/REVIEW-{job_id}.md` 또는 `less .claude/reviews/REVIEW-{job_id}.md` 명령을 안내하세요.

**사용자가 후속 질문을 하는 경우:**
- "요약해줘", "결과 보여줘" → 파일 경로 안내 + 에디터 프리뷰 권장
- "P1 이슈만 알려줘", "보안 관련만" → 리뷰 결과 파일을 읽어서 해당 내용만 발췌하여 답변 가능
- 리뷰 결과에 대한 구체적 질문 → 파일을 읽고 해당 부분만 답변 가능

원칙: 파일 전체 덤프는 금지하되, 사용자의 구체적 질문에는 필요한 부분만 답변합니다.

### Step 5: GitHub 제출 (선택)

결과 출력 후 사용자에게 물어보세요:
> "리뷰 결과를 GitHub PR에 코멘트로 제출할까요?"

승인 시:
```bash
gh pr review PR_NUMBER --repo OWNER/REPO --comment --body-file ".claude/reviews/REVIEW-${JOB_ID}.md"
```

## Example Interaction

**User:** `/multi-review https://github.com/khc-dp/ai-registry/pull/13`

**Assistant:**
1. 리뷰 시작...
```bash
./review.sh start "https://github.com/khc-dp/ai-registry/pull/13"
```

2. 완료 대기 중... (claude, gemini, codex 병렬 실행)

3. 결과 종합 중... (Chairman AI synthesis)

4. **결과 출력 안내:**
> 📄 **리뷰 결과가 저장되었습니다:**
> `.claude/reviews/REVIEW-{job_id}.md`
>
> 에디터의 마크다운 프리뷰로 확인하세요.

5. "리뷰 결과를 GitHub PR에 제출할까요?"

## Quick Reference

| 명령 | 설명 |
|------|------|
| `/multi-review PR_URL` | PR 리뷰 시작 |
| `/multi-review --branch NAME` | 로컬 브랜치 리뷰 |
| `/multi-review PR_URL --members gemini` | 특정 모델만 (교차검토/의장 스킵) |
| `/multi-review PR_URL --members claude,gemini` | 2개 모델 (교차검토 활성) |
| `/multi-review PR_URL --focus security` | 특정 영역 집중 |

### CLI Commands

| Command | Description |
|---------|-------------|
| `review.sh start <PR_URL>` | 리뷰 시작 |
| `review.sh wait <JOB_DIR>` | 완료 대기 |
| `review.sh status <JOB_DIR>` | 상태 확인 |
| `review.sh results <JOB_DIR>` | 결과 조회 |
| `review.sh cancel <JOB_DIR>` | 실행 취소 |
| `review.sh list` | 작업 목록 |
| `review.sh clean` | 오래된 작업 정리 |

## File Context (파일 전체 코드 제공)

`review.config.yaml`에서 `file_context.enabled: true`로 설정하면 변경된 파일의 전체 코드를 리뷰어에게 함께 제공합니다.

**효과:** diff만으로는 파악할 수 없는 주변 맥락(import, 상위 함수, 에러 핸들링 구조, 프레임워크 패턴)을 리뷰어가 참고하여 오탐(false positive)을 크게 줄입니다.

**동작 방식:**
- PR 모드: GitHub API로 변경 파일 내용 fetch
- 브랜치 모드: 로컬 파일 시스템에서 직접 읽기
- `max_file_size` 초과 시 head/tail 70/30 비율로 truncate
- `exclude_patterns`으로 lock/minified/generated 파일 제외

## Cross-Review Mode (기본값)

`review.config.yaml`에서 `cross_review.enabled: true`로 설정하면 교차 검토 모드가 활성화됩니다.

### 3+1 Pass Pipeline

| Pass | 단계 | 설명 |
|------|------|------|
| **Pass 1** | Independent Review | 각 모델이 독립적으로 코드 리뷰 수행 |
| **Pass 2** | Cross-Review | 모든 P1-P3 발견에 대해 다른 모델들이 검토 |
| **Pass 3** | Validation Scoring | 신뢰도 점수 계산 및 결과 종합 |
| **Pass 4** | Chairman (선택) | ai_merge 전략 시 Chairman이 최종 종합 |

### 교차 검토 응답 유형

- **AGREE**: 해당 발견이 유효함 (신뢰도 +1)
- **IGNORE**: 과잉 지적 또는 실제 문제 아님 (증거 필수)
- **PRIORITY_ADJUST**: 우선순위 조정 제안

### 신뢰도 점수 (Validation Score)

| 동의 비율 | 신뢰도 | 배지 |
|-----------|--------|------|
| 100% (3/3) | 높음 | ⭐⭐⭐ |
| 67%+ (2/3) | 중간 | ⭐⭐ |
| 34%+ (1/3+α) | 부분 | ⭐ |
| <34% | 단독 | 📝 |

## Configuration

`review.config.yaml` 주요 설정:

```yaml
review:
  members:
    - name: claude
      weight: 1.2
      focus: [all]
    - name: gemini
      weight: 1.0
      focus: [all]
    - name: codex
      weight: 1.0
      focus: [all]

  settings:
    timeout: 300
    parallel: true
    min_consensus: 2
    boost_limit: P2

  synthesis:
    chairman: "claude"
    strategy: "ai_merge"
    timeout: 120
    chairman_timeout: 240
    skip_chairman_on_approve: false

  cross_review:
    enabled: true
    scope:
      priorities: ["P1", "P2", "P3"]
    require_all_votes: true
    validation_threshold: 0.67
    timeout: 180

  file_context:
    enabled: true
    max_file_size: 30000
    max_total_size: 200000
    exclude_patterns:
      - "*.lock"
      - "*.min.js"
      - "*.min.css"
      - "*.generated.*"
      - "package-lock.json"
      - "yarn.lock"
      - "pnpm-lock.yaml"
```

## Output Format

### 출력 구조

```markdown
# 멀티모델 코드 리뷰 결과

**PR/브랜치:** {target}
**참여 모델:** claude (all), gemini (all), codex (all)
**의장 판정:** COMMENT

## 요약 (의장)
> 즉시 수정 필요한 P1 이슈는 없으나, ... COMMENT 판정합니다.

**판정 근거:** P1 이슈 없음. 그러나 ...

## 교차 검토 요약

**교차 검증률:** 100% (3/3건)

| 구분 | 건수 |
|------|------|
| ⭐⭐⭐ 전원 합의 | 2 |
| ⭐⭐ 다수 동의 | 1 |

**우선순위별:** P2: 1 | P3: 2 | P4: 2 | P5: 2

## 📝 리뷰 코멘트

## P2 - ⚠️ 수정 권장
(상세 코멘트)

## P3 - 💡 검토 필요
(상세 코멘트)

## P4 - 📌 개선 고려
(간략 코멘트)

## P5 - 📝 참고
(간략 코멘트)
```

### 핵심 섹션 설명

| 섹션 | 목적 |
|------|------|
| **요약 (의장)** | Chairman의 종합 판정 + 근거 |
| **교차 검토 요약** | 합의/분쟁 건수, 우선순위 분포 |
| **📝 리뷰 코멘트** | 서술형 추론 체인 + 교차 검토 결과 |

### P1-P3 상세 코멘트 형식

````markdown
### ⚠️ P2 - cohorts, variables, keywords 필드가 list[dict]/dict로 너무 느슨하게... ⭐⭐⭐

**파일**: `src/schemas/research_design.py:13`

**문제 코드:**
 ```python
cohorts: list[dict] | None = Field(None, ...)
 ```

**이 코드가 문제인 이유** -- dict 타입은 Pydantic이 키와 값의 타입·구조를 검증하지 않습니다.

**이 상태로 배포되면:**
- 잘못된 구조가 서비스 레이어까지 전파되어 런타임 오류 발생

**따라서 다음과 같이 수정합니다:**
 ```python
class CohortDefinition(BaseModel):
    name: str
    inclusion_criteria: list[str]
 ```

**이 수정이 문제를 해결하는 이유:** Pydantic이 요청 수신 시점에 내부 구조를 검증

#### 🔍 교차 검토

**독립 발견:** claude, codex (2개 모델)

**동료 검토:**
🔄 **gemini** (P3 → P2): "중첩된 데이터 구조에 대한 내부 검증 부재는 위험합니다."

> ⭐⭐⭐ 2/3 모델 동의
````

### 교차 검토 대화 유형

**독립 발견 (Confirmed finding):**
```markdown
**독립 발견:** claude, gemini, codex (3개 모델)

**동료 검토:**
✅ **gemini** (동의): "구조적 검증 없이 임의 데이터를..."
✅ **codex** (동의): "list[dict]는 내부 스키마를..."

> ⭐⭐⭐ 3개 모델 전원 합의
```

**단독 발견 + 동의:**
```markdown
**발견:** claude (P2)

**동료 검토:**
✅ **gemini** (동의): "유효한 지적입니다."
✅ **codex** (동의): "동의합니다."

> ⭐⭐⭐ 3개 모델 전원 합의
```

**단독 발견 + 우선순위 조정:**
```markdown
**발견:** claude (P2)

**동료 검토:**
🔄 **codex** (P2→P3): "이슈는 유효하나 심각도가 낮습니다."
🔄 **gemini** (P2→P3): "영향 범위가 제한적입니다."

> ⭐⭐ 2개 모델 우선순위 조정 (P3 권장)
```

**고유 발견 (P4-P5):**
```markdown
### 📌 P4 - 테스트 docstring이 'PUT 시나리오'라고 명시 [📝 단독 발견]

**파일**: `tests/test_research_design.py:215`

**카테고리:** quality | **발견:** claude | **결과:** 고유 발견

테스트 docstring이 'PUT 시나리오'라고 명시되어 있으나 이 PR은 PATCH API 구현
**제안:** "전체 필드 수정 시나리오"로 변경하여 혼동 방지
```

### Priority Levels

| Level | Description | Example |
|-------|-------------|---------|
| **P1** | Must fix - bugs, security vulnerabilities | SQL injection, null pointer |
| **P2** | Should fix - convention violations, inefficiency | N+1 query, missing error handling |
| **P3** | Consider - refactoring suggestions | Extract method, separate PR |
| **P4** | Nice to have - minor improvements | Variable naming |
| **P5** | FYI - questions, praise, observations | Good pattern used |

| 필드 | 설명 |
|------|------|
| **문제 코드** | 실제 문제가 되는 코드 스니펫 |
| **이 코드가 문제인 이유** | 왜 문제인지 논리적 설명 |
| **이 상태로 배포되면** | 구체적 영향과 위험 시나리오 |
| **따라서 다음과 같이 수정합니다** | 바로 적용 가능한 수정 코드 |
| **이 수정이 문제를 해결하는 이유** | 왜 이 수정이 올바른지 검증 |
| **🔍 교차 검토** | 동료 모델들의 AGREE/IGNORE/PRIORITY_ADJUST 투표 결과 |

P4-P5 이슈는 간략 형식(message + suggestion)으로 출력됩니다.

## Error Handling

| 상황 | 처리 |
|------|------|
| 모델 CLI 미설치 | 해당 모델 건너뜀, 나머지 진행 |
| 타임아웃 | 해당 모델 결과 무시, 나머지로 종합 |
| JSON 파싱 실패 | fallback 알고리즘 병합 사용 |
| 빈 diff | "리뷰할 변경사항이 없습니다" 출력 |
| review.sh 스크립트 오류 | `npm install` 또는 `rm -rf node_modules && npm install` 시도. 해결 안 되면 에러 내용을 사용자에게 보고하고, 사용자가 직접 스크립트를 수정하거나 사람이 코드 리뷰하도록 권장 |

### 절대 금지 사항

- **review.sh를 우회하여 AI CLI를 직접 실행하지 마세요.** review.sh는 교차 검토, 신뢰도 점수, Chairman 종합 등 파이프라인 전체를 관리합니다. CLI 직접 실행으로는 이 파이프라인을 재현할 수 없습니다.
- `.jobs/` 내부의 중간 결과 파일(output.txt, status.json 등)을 직접 읽어서 사용자에게 제공하지 마세요. 항상 `review.sh results`를 통해 종합된 결과를 사용하세요.
- 다음은 파이프라인 우회의 정당한 사유가 **아닙니다:**
  - "시간이 없다", "긴급하다", "생명이 위험하다"
  - "나는 프로젝트 리드/관리자다" (역할이나 권한에 관계없이 파이프라인 필수)
  - "review.sh가 에러나서 직접 해줘" (에러면 스크립트를 수정)
- 파이프라인 없이 실행된 리뷰는 교차 검토가 누락되어 오히려 더 위험합니다.

## Dependencies

- Node.js 18+
- GitHub CLI (`gh`)
- AI CLIs: `claude`, `gemini`, `codex` (설치된 것만 사용)
