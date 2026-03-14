# Multi-Model Code Review Plugin

여러 AI 모델(Claude, Codex, Gemini)을 활용하여 PR을 병렬로 리뷰하고 결과를 종합하는 플러그인입니다.

## Prerequisites

| Dependency | Installation | Verification |
|------------|--------------|--------------|
| **Node.js 18+** | [nodejs.org](https://nodejs.org) | `node --version` |
| **GitHub CLI** | `brew install gh` | `gh auth status` |
| **AI CLI** (1개 이상) | 아래 참조 | 해당 명령어 실행 |

### AI CLIs

| CLI | Installation |
|-----|--------------|
| Claude | `npm install -g @anthropic-ai/claude-code` |
| Codex | `npm install -g @openai/codex` |
| Gemini | `npm install -g @google/gemini-cli` |

> 설치된 CLI만 자동으로 사용됩니다.

---

## Quick Start

### 의존성 설치

```bash
cd plugins/common/multi-model-review/skills/multi-model-review
npm install
```

### 플러그인 설치

```bash
# Option A: Claude Code 플러그인
claude plugins:install ai-registry/multi-model-review

# Option B: settings.json에 추가
{
  "plugins": ["/path/to/plugins/common/multi-model-review"]
}
```

### 사용법

```bash
# 슬래시 명령어
/multi-review https://github.com/org/repo/pull/123
/multi-review --branch feature/new-feature
/multi-review PR_URL --members claude,gemini
/multi-review PR_URL --focus security,performance

# 자연어
"이 PR 멀티 모델로 리뷰해줘"
"multi model review for PR #123"
```

### 직접 스크립트 실행

```bash
cd scripts
./review.sh start https://github.com/org/repo/pull/123
./review.sh wait <JOB_DIR>
./review.sh results <JOB_DIR> --synthesis ai_merge --markdown
```

---

## Features

- **병렬 리뷰**: 여러 AI 모델이 동시에 리뷰 (3개 모델 → 1개 모델 시간만 소요)
- **교차 검토**: 모든 P1-P3 발견에 대해 다른 모델들이 검토하여 신뢰도 부여
- **신뢰도 점수**: 동의 모델 수 기반 신뢰도 (⭐⭐⭐ 100% / ⭐⭐ 67%+ / ⭐ 34%+)
- **Chairman AI 종합**: 중복 제거, 충돌 해결, 우선순위 조정
- **Consensus Boost**: 2+ 모델 동의 시 우선순위 상향
- **Efficiency Metrics**: 멀티모델의 추가 발견율 정량화

### Model Specialization

| Model | Weight | Emoji | Color | 설명 |
|-------|--------|-------|-------|------|
| **Claude** | 1.2 | 🤖 | purple | Host 모델, 가중치 높게 |
| **Gemini** | 1.0 | ✨ | blue | Google Gemini |
| **Codex** | 1.0 | 🧠 | green | OpenAI Codex |

> 모든 모델이 전 관점에서 리뷰 (`focus: [all]`). 커스터마이징 가능.

---

## Priority Levels

| Level | Description | Example |
|-------|-------------|---------|
| **P1** | Must fix - 버그, 보안 취약점 | SQL injection, null pointer |
| **P2** | Should fix - 비효율, 유지보수성 | N+1 query, missing error handling |
| **P3** | Consider - 리팩토링 제안 | Extract method |
| **P4** | Nice to have - 사소한 개선 | Variable naming |

### Detailed Comment Format (P1-P3)

P1-P3 이슈는 풍부한 컨텍스트와 함께 상세 형식으로 출력됩니다:

````markdown
### src/clients/api_client.py:94 [P1]

**현재 코드:**
```python
return await self.client.post(url, json=data, verify_ssl=False)
```

**우려사항:**
verify_ssl=False가 하드코딩되어 있어 TLS 인증서 검증을 건너뜁니다.
이는 중간자 공격(MITM)에 취약합니다.

**해결 방안:**
```python
return await self.client.post(url, json=data, verify_ssl=settings.api_verify_ssl)
```

**이점:**
- 프로덕션에서는 SSL 검증 활성화
- 개발/테스트 환경에서만 선택적 비활성화
````

P4 이슈는 간략 형식(message + suggestion)으로 출력됩니다.

---

## Output Format

### 핵심 섹션

| 섹션 | 목적 |
|------|------|
| **🔥 의견 차이** | 모델 간 의견이 갈린 핵심 이슈 - 테이블로 비교, 의장 결정 근거 포함 |
| **✅ 합의된 이슈** | 2+ 모델이 동의한 이슈 - 높은 신뢰도, 각 모델 관점 포함 |
| **📝 고유 발견 요약** | 전문 영역별 기여도 요약 테이블 |

### 의견 차이 섹션 (가장 중요)

```markdown
## 🔥 의견 차이 (DISPUTED)

### src/file.py:194

| 모델 | 우선순위 | 의견 |
|------|----------|------|
| **claude** | P2 | 런타임 에러지만 테스트에서 잡힐 가능성... |
| **gemini** | P1 | 프로덕션에서 TypeError 발생 시 서비스 장애... |

**🎯 의장 결정: P1**
> gemini의 프로덕션 영향도 논거가 더 설득력 있음
```

### 고유 발견 요약

```markdown
## 📝 고유 발견 요약

| 발견자 | 건수 | 인정됨 | 주요 카테고리 |
|--------|------|--------|--------------|
| **claude** | 6건 | 2건 | security(3), quality(2) |
| **gemini** | 2건 | 1건 | performance(2) |
```

### 신뢰도 배지 (Cross-Review 모드)

| 배지 | 의미 |
|------|------|
| `[신뢰도 100%] ⭐⭐⭐` | 모든 모델 동의 - 높은 신뢰도 |
| `[신뢰도 66%] ⭐⭐` | 2/3 모델 동의 - 검증됨 |
| `[신뢰도 33%] ⭐` | 일부 동의 - 부분 검증 |
| `[📝 단독 발견]` | 동료 검증 없음 |

---

## Cross-Review Architecture

### 3+1 Pass Pipeline

| Pass | 단계 | 설명 |
|------|------|------|
| **Pass 1** | Independent Review | 각 모델이 독립적으로 코드 리뷰 수행 |
| **Pass 2** | Cross-Review | 모든 P1-P3 발견에 대해 다른 모델들이 AGREE/IGNORE 투표 |
| **Pass 3** | Validation Scoring | 신뢰도 점수 계산 및 결과 종합 |
| **Pass 4** | Chairman (선택) | ai_merge 전략 시 Chairman이 최종 종합 |

### 신뢰도 점수 (Validation Score)

| 동의 비율 | 신뢰도 | 배지 |
|-----------|--------|------|
| 100% (3/3) | 높음 | ⭐⭐⭐ |
| 67%+ (2/3) | 검증됨 | ⭐⭐ |
| 34%+ (1/3+α) | 부분 | ⭐ |
| <34% | 단독 | 📝 |

---

## Configuration

`review.config.yaml`:

```yaml
review:
  # 리뷰 참여 모델
  members:
    - name: claude
      command: "claude -p --output-format json"
      weight: 1.2              # 가중치 (consensus 계산 시 사용)
      emoji: "🤖"
      color: "purple"
      focus: [all]
    - name: gemini
      command: "gemini"
      weight: 1.0
      emoji: "✨"
      color: "blue"
      focus: [all]
    - name: codex
      command: "codex exec"
      weight: 1.0
      emoji: "🧠"
      color: "green"
      focus: [all]

  # 실행 설정
  settings:
    timeout: 300              # 모델당 타임아웃 (초)
    parallel: true            # 병렬 실행 (false면 순차)
    min_consensus: 2          # 2개 이상 모델 동의 시 우선순위 상향
    exclude_chairman: false   # false: chairman도 worker로 참여
    boost_limit: P2           # P2 이상은 부스트하지 않음
                              # 3+ 모델 동의: +2 레벨
                              # 2 모델 동의 또는 weighted >= 2.0: +1 레벨

  # 출력 설정
  output:
    format: "json"
    deduplicate: true
    priority_order: ["P1", "P2", "P3", "P4"]
    verbosity: "standard"              # minimal | standard | detailed
    show_value_proposition: true       # 멀티모델 가치 섹션
    show_cross_review_highlights: true # 교차 검토 하이라이트
    show_priority_evolution: true      # 우선순위 변경 이력
    show_model_perspectives: true      # 모델별 관점

  # 종합 설정
  synthesis:
    chairman: "claude"
    strategy: "ai_merge"      # merge | ai_merge
    timeout: 120              # Worker 모델 타임아웃 (초)
    chairman_timeout: 180     # Chairman 전용 타임아웃 (초)
    skip_chairman_on_approve: false  # 전원 APPROVE면 Chairman 스킵
    smart_skip:               # Cross-Review 결과 기반 Chairman 자동 생략
      enabled: true
      validation_threshold: 80
      max_unresolved_critical: 0

  # 리뷰 관점 (모든 모델이 사용)
  perspectives:
    - name: security          # 보안 취약점
      enabled: true
    - name: performance       # 성능 이슈
      enabled: true
    - name: quality           # 코드 품질
      enabled: true
    - name: testing           # 테스트 커버리지
      enabled: true
    - name: docs              # 문서화
      enabled: false

  # 교차 검토 설정
  cross_review:
    enabled: true
    scope:
      priorities: ["P1", "P2", "P3"]
    require_all_votes: true           # 모든 발견에 대해 vote 필수
    validation_threshold: 0.67
    timeout: 180                      # 교차 검토 패스 타임아웃 (초)

# GitHub 연동
github:
  auto_submit: false          # true면 승인 없이 자동 제출
  review_type: "COMMENT"      # APPROVE | COMMENT | REQUEST_CHANGES
  add_line_comments: true     # 라인별 코멘트 추가
```

### Synthesis Strategies

| Strategy | Description | Cost |
|----------|-------------|------|
| `merge` | 알고리즘 기반 병합 | 무료 |
| `ai_merge` | Chairman AI 의미 기반 종합 (스마트 스킵 시 자동 생략) | API 0~1회 |

### Smart Skip (Chairman 자동 생략)

`smart_skip.enabled: true`일 때, Cross-Review(Pass 2-3) 결과가 충분히 높은 합의를 보이면 Chairman(Pass 4)을 생략합니다:

| 조건 | Chairman |
|------|----------|
| 검증률 80%+ AND 미검증 P1/P2 0건 | 스킵 (알고리즘 병합) |
| 검증률 낮거나 P1/P2 분쟁 존재 | 호출 (코드 기반 판정) |
| 전원 APPROVE (`skip_chairman_on_approve`) | 스킵 |

### Consensus Boost

2개 이상 모델이 동일 이슈를 지적하면 우선순위가 상향됩니다:

| 조건 | Boost | 예시 |
|------|-------|------|
| 3+ 모델 동의 | +2 레벨 | P4 → P2 |
| 2 모델 동의 또는 weighted >= 2.0 | +1 레벨 | P4 → P3 |
| `boost_limit: P2` | P2 이상은 부스트 안 함 | P2 → P2 (유지) |

---

## CLI Reference

```bash
./review.sh <command> [options]
```

| Command | Description |
|---------|-------------|
| `start <PR_URL>` | 리뷰 시작 |
| `start --branch <NAME>` | 로컬 브랜치 리뷰 |
| `wait <JOB_DIR>` | 완료 대기 |
| `results <JOB_DIR>` | 결과 조회 |
| `list` / `clean` | 작업 관리 |

| Option | Example |
|--------|---------|
| `--members` | `--members claude,gemini` |
| `--focus` | `--focus security` |
| `--synthesis` | `--synthesis ai_merge` |
| `--markdown` | Markdown 출력 |

---

## Architecture

| 단계 | 설명 |
|------|------|
| **Pass 1: 독립 리뷰** | claude, gemini, codex 병렬 실행 |
| **Pass 2: 교차 검토** | 각 모델이 다른 모델의 P1-P3 발견을 AGREE/IGNORE 투표 |
| **Pass 3: 결과 종합** | 신뢰도 점수 계산 + 결과 병합 |
| **Pass 4: Chairman** | ai_merge 전략 시 Chairman이 최종 종합 (선택적) |

---

## When to Use

| Recommended | Not Recommended |
|-------------|-----------------|
| Security-critical code | Small fixes (<50 LOC) |
| Large refactoring (500+ LOC) | Documentation-only |
| Complex algorithms | Need decision in <5 min |

---

## License

MIT
