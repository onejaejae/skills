# mirror

요청 이해 확인 스킬 — 사용자 요청을 구조화된 방식으로 되돌려 이해를 검증하고, 확인을 받은 뒤 다음 단계로 핸드오프합니다.

## 설치

```bash
/plugin install mirror@ai-registry
```

## 사용법

### 트리거

- `/mirror`, `mirror back`, `echo back`
- `이해한 거 맞아?`, `내가 뭘 원하는지 말해봐`, `확인해줘`
- `paraphrase this`, `너가 이해한 거 설명해봐`, `what did I ask?`

### 핵심 동작

```
PARSE   → 입력에서 What/Why/Scope/Constraints 추출
MIRROR  → 구조화된 이해를 자신의 언어로 제시
CONFIRM → AskUserQuestion으로 확인 요청
  ├── "Yes" → 핸드오프 옵션 제공
  ├── "Close" → 수정 반영 후 재미러
  └── "No" → 처음부터 재시도
```

### MIRROR 섹션 형식

```markdown
## Mirror Back

### What (deliverable)
[전달물/작업 내용 — 자신의 언어로]

### Why (motivation)
[동기/문제 — 불명확하면 가정 명시]

### Scope
- In: [포함 범위]
- Out: [제외 범위]

### Constraints
- [제약 조건 목록]

### Gaps & Assumptions
- [불확실한 부분 또는 가정]
```

### Fast Path

이미 명확한 요청(What/Why/Scope/Constraints가 모두 명시된 경우)에는 전체 미러 대신 1-2문장 요약으로 즉시 확인합니다.

### 유사 스킬 비교

| 스킬 | 목적 | 선택 기준 |
|------|------|----------|
| `/mirror` | 이해 확인 및 검증 | Claude가 요청을 정확히 이해했는지 확인 |
| `/discuss` | 소크라테스식 아이디어 탐구 | 개념 탐구가 목적일 때 |
| `/stepback` | 원샷 관점 리셋 | 작업 중 방향 점검 |
| `/specify` | 완전한 스펙 생성 | 요청 확인 후 상세 기획 필요 시 |
| `clarify:vague` | 모호한 요구사항 구체화 | 아직 형태가 없는 아이디어 |

### 특징

- 최대 3라운드 circuit breaker (3회 미확인 시 직접 서술 요청)
- 계획/코드/git 명령 절대 생성 금지
- 확인 후 `/specify`, `/execute`, `/discuss` 등 핸드오프 옵션 제공

## 버전

- Current: 1.0.0
- [CHANGELOG](./CHANGELOG.md)
