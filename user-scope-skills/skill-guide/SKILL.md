---
name: skill-guide
description: >
  Use when "스킬 추천", "어떤 스킬 써야해", "skill guide", "뭐부터 해야해",
  "어떻게 시작해야 할까", "skill recommend", "워크플로우 추천".
  사용자가 하고 싶은 작업을 말했지만 어떤 스킬을 쓸지 모를 때 사용.
allowed-tools: "Read, Glob, Grep, AskUserQuestion, Bash, WebFetch"
---

# Skill Guide

사용자의 요구에 맞는 스킬을 추천하는 메타 스킬.
단순 작업이면 단일 스킬, 복합 작업이면 순서 있는 파이프라인을 추천한다.

## 스킬 탐색 우선순위

**반드시 이 순서대로 탐색한다:**

```
1순위: ai-registry (팀 공용 플러그인)
  └─ github.com/khc-dp/ai-registry 의 스킬 중 매칭되는 것
  └─ 설치됨 → 바로 추천
  └─ 미설치 → 추천 + 설치 안내

2순위: 현재 설치된 스킬 (system-reminder 목록)
  └─ 1순위에서 적합한 스킬을 못 찾았을 때만
```

### ai-registry 카탈로그 로딩 (동적 하이브리드)

**하드코딩된 카탈로그를 사용하지 않는다.** 매번 marketplace.json을 읽어서 최신 상태를 반영한다.

**Step 1: marketplace.json 읽기 (3단계 fallback)**

```
1순위: gh api로 원격 최신 버전 읽기 (항상 최신)
  Bash: gh api repos/khc-dp/ai-registry/contents/.claude-plugin/marketplace.json --jq '.content' | base64 -d

  └─ 실패 시 (네트워크 없음, 인증 실패 등)
2순위: 로컬 marketplace.json 읽기
  Read: ~/.claude/plugins/marketplaces/ai-registry/.claude-plugin/marketplace.json

  └─ 파일 없으면
3순위: system-reminder 스킬 목록만으로 매칭 (ai-registry 탐색 생략)
```

**Step 2: plugins 배열에서 매칭**
각 플러그인의 `name`, `description`, `keywords`를 사용자 요구와 매칭한다.
- `name`: 스킬 이름 (예: "skill-workflow", "create-pr")
- `description`: 용도 설명 (자연어 매칭)
- `keywords`: 키워드 배열 (예: ["skill", "workflow", "create"])

**Step 3: 설치 여부 확인**
system-reminder의 스킬 목록에 해당 스킬 이름이 있으면 설치됨.
없으면 미설치 → 설치 안내를 출력한다.

## 동작 원리

1. 사용자 요구를 분석한다
2. **marketplace.json을 읽는다** (1순위: `gh api`로 원격 → 2순위: 로컬 Read → 3순위: 생략)
3. marketplace.json의 plugins 배열에서 name/description/keywords로 매칭한다
4. ai-registry에 적합한 스킬이 있으면:
   - system-reminder 목록에 있으면 → 바로 추천
   - 목록에 없으면 → 추천 + 설치 안내
5. ai-registry에 없으면 → system-reminder의 나머지 스킬에서 매칭
6. 복잡도를 판단하여 단일 추천 또는 파이프라인을 출력한다
7. **best practice 사용 예시를 함께 제시한다**

## 복잡도 판단 기준

| 조건 | 판단 | 출력 |
|------|------|------|
| 작업이 하나의 스킬 범위 안에 들어감 | 단순 | 단일 추천 |
| 작업이 여러 단계(탐색→생성→검증 등)를 포함 | 복합 | 파이프라인 |
| 작업이 여러 도메인에 걸침 | 복합 | 파이프라인 |

## 출력 포맷

### 단일 추천 — ai-registry (설치됨)

```
## 추천 스킬

`/skill-name` — 1줄 근거
📦 소스: ai-registry (팀 공용) | 설치됨

### 사용 예시
> 이렇게 사용하세요:
> 1. `/skill-name` 호출
> 2. [구체적 사용 시나리오 1-2줄]
> 3. [기대 결과]
```

### 단일 추천 — ai-registry (미설치)

```
## 추천 스킬

`/skill-name` — 1줄 근거
📦 소스: ai-registry (팀 공용) | ⚠️ 미설치

설치 명령:
  /install-plugin ai-registry plugin-name

### 사용 예시
> 설치 후 이렇게 사용하세요:
> 1. `/skill-name` 호출
> 2. [구체적 사용 시나리오 1-2줄]
> 3. [기대 결과]
```

### 단일 추천 — system-reminder fallback (개인/기타 마켓플레이스 스킬)

```
## 추천 스킬

`/skill-name` — 1줄 근거
📦 소스: 개인 스킬 | 설치됨

### 사용 예시
> 이렇게 사용하세요:
> 1. `/skill-name` 호출
> 2. [구체적 사용 시나리오 1-2줄]
> 3. [기대 결과]
```

### 파이프라인 추천

```
## 추천 워크플로우

| 순서 | 스킬 | 이유 | 소스 |
|------|------|------|------|
| 1 | `/first-skill` | ... | ai-registry ✅ |
| 2 | `/second-skill` | ... | 개인 스킬 ✅ |

### 사용 예시
> 이 워크플로우는 이렇게 진행하세요:
> 1. 먼저 `/first-skill`로 [무엇을 하고]
> 2. 산출물을 가지고 `/second-skill`로 [다음 단계]
> 3. [최종 기대 결과]

> 첫 스킬부터 순서대로 실행하세요: `/first-skill`
```

## RULES

1. **반드시 위 포맷을 따른다** — 자유 형식 금지
2. **ai-registry 스킬을 항상 먼저 검토한다** — 팀 표준 도구 우선
3. **각 추천에 1줄 근거를 반드시 포함한다**
4. **소스(ai-registry / 개인 스킬)와 설치 여부를 반드시 표시한다**
5. **미설치 시 설치 명령어를 반드시 안내한다**
6. **best practice 사용 예시를 반드시 포함한다** — 스킬명만 던지지 않는다
7. **단일 추천 시 1개만 추천한다** — 여러 개 나열 금지
8. **파이프라인은 최대 3단계까지만**
9. **각 단계는 반드시 다른 도메인의 스킬이어야 한다**
10. **스킬 목록에도 ai-registry에도 없는 스킬은 추천하지 않는다**

## Best Practice 작성 기준

사용 예시는 다음 기준으로 작성한다:

1. **스킬의 SKILL.md를 이미 알고 있으면** → 그 내용 기반으로 best practice 제시
2. **잘 모르면** → `~/.claude/skills/{skill-name}/SKILL.md` 또는 플러그인 캐시에서 Read로 확인
3. **그래도 정보가 부족하면** → 스킬의 description과 용도에서 추론하되, "추정 기반"임을 명시

best practice에 포함할 내용:
- **입력**: 스킬에 무엇을 전달해야 하는지 (예: "기획 아이디어를 한 줄로 설명")
- **과정**: 스킬이 어떤 흐름으로 진행되는지 (예: "3라운드 인터뷰 후 문서 생성")
- **산출물**: 최종 결과물이 무엇인지 (예: "specs/ 폴더에 기획서.md 생성")

## 매칭 예시 (Few-shot)

| 사용자 입력 | 추천 | 탐색 경로 | 유형 |
|-------------|------|-----------|------|
| "기획서 만들고 싶어" | `/spec-pipeline` | marketplace.json → 매칭 | 단일 |
| "스킬 만들고 싶어" | `/skill-workflow` | marketplace.json → 매칭 | 단일 |
| "PR 올리고 싶어" | `/create-pr` | marketplace.json → 매칭 | 단일 |
| "코드 리뷰 받고 싶어" | `/multi-model-review` | marketplace.json → 매칭 | 단일 |
| "프론트엔드 개발해야 해" | `/dp-fe-agent` | marketplace.json → 매칭 | 단일 |
| "아이디어가 모호한데 스킬 만들고 싶어" | `/ideation` → `/skill-workflow` | marketplace.json → 매칭 | 파이프라인 |
| "데이터 분석하고 대시보드 만들어줘" | `/data:analyze` → `/data:build-dashboard` | system-reminder fallback | 파이프라인 |
| "기술 A vs B 비교해줘" | `/dev:tech-decision` | system-reminder fallback | 단일 |

### 매칭 불가 시 출력 포맷

```
현재 스킬 목록에 해당 작업에 특화된 스킬이 없습니다.
스킬 없이 직접 진행하시거나, 요구사항을 다르게 표현해보세요.
```

**매칭 불가 시에도 자유 형식 금지. 위 포맷만 사용한다.**

### 요구가 모호하여 후보가 2개 이상일 때

같은 도메인에서 후보 스킬이 2개 이상이고 사용자 의도를 특정할 수 없으면, **가장 가능성 높은 1개를 추천하되 대안을 1줄로 덧붙인다**:

```
## 추천 스킬

`/create-pr` — PR 생성이 가장 일반적인 PR 작업
📦 소스: ai-registry (팀 공용) | 설치됨

### 사용 예시
> ...

💡 다른 PR 작업이라면: `/pr-review-reply` (리뷰 응답), `/multi-model-review` (코드 리뷰)
```

**자유 형식 질문 금지** — AskUserQuestion으로 돌아가지 않는다. 추천 후 사용자가 정정하면 그때 변경한다.

## 주의사항

- **이미 파이프라인 스킬이 존재하면 그것을 단일 추천한다** (예: spec-pipeline, dp-fe-agent)
- 사용자가 추가 설명 없이 "/skill-guide"만 입력하면, 무엇을 하고 싶은지 한 줄로 물어본다
- 추천 후 사용자가 실행하지 않으면 강요하지 않는다
- ai-registry에 같은 이름의 스킬과 개인 스킬이 둘 다 있으면 ai-registry 버전을 우선한다
