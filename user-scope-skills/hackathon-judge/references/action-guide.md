# Action Item Generation Guide

> Judge LLM이 action items를 생성할 때 참조. action items는 "실패한 체크포인트 → 구체 수정"의 1:1 매핑.

## 필수 필드

각 action item은 아래 6개 필드를 모두 채워야 한다. 하나라도 비면 그 action은 무효.

| 필드 | 타입 | 설명 |
|------|------|------|
| `target_checkpoint` | string | 실패한 체크포인트 ID (예: "C1.3") |
| `target_file` | string | 수정할 파일 경로 (레포 루트 기준) |
| `target_section` or `target_line` | string | 수정 위치 — 섹션 헤더("§1") 또는 라인 번호("L42") |
| `change_description` | string | "무엇을 추가/수정/삭제" — 그대로 실행 가능한 수준 |
| `expected_score_delta` | float | 이 action으로 얻는 점수 (체크포인트 1개당 점수) |
| `effort` | "low" \| "medium" \| "high" | LOC 변경량 (low<10, medium<50, high>50) |

## ROI 계산

```
effort_score = {"low": 1, "medium": 3, "high": 9}
roi = expected_score_delta / effort_score
```

action items는 ROI 내림차순 정렬. cycle당 상위 **5개**만 실행.

## `change_description` 작성 원칙

### ❌ 금지 예시 (추상적)

- "창의성을 높여라"
- "더 구체적인 예시 추가"
- "스토리텔링 강화"
- "Cortex 사용 증가"

### ✅ 허용 예시 (구체적)

- "`specs/moving-simulator-spec.md §1` 마지막 문단 뒤에 '연결 방법: Richgo SGG(한글)와 SPH CITY_CODE(숫자)를 시군구 한글명으로 교차 매칭' 1문장 추가"
- "`specs/presentation-script.md` 신규 생성, 섹션 4개: 문제 정의 / 데모 / 기술 / 향후. 2+5+2+1 분 구조"
- "`app/queries.py::generate_ai_summary` 프롬프트에 `[사용자 상황]` 블록 추가, `current_sgg` 인자를 삽입"

## target_file 우선순위

Judge는 수정 대상 파일을 고를 때 아래 우선순위를 따른다:

1. **specs/moving-simulator-spec.md** — 기획서 관련 (창의성 C1~C3, 현실성 R2~R3)
2. **app/streamlit_app.py** — UI 관련 (AI A2, 현실성 R1)
3. **app/queries.py** — LLM/SQL 로직 (AI A1~A3)
4. **app/config.py** — 상수 (AI A3, Snowflake S2)
5. **specs/presentation-script.md** — 발표 관련 (P1~P3) — 없으면 생성
6. **state/findings.md** — 학습 추적 (Snowflake S3, 현실성 R3) — 절대 수동 생성 금지, 새 F# 기록만

### 절대 건드리지 말 것

- `CLAUDE.md` — Layer 1 원칙. Judge가 수정하면 4-Layer 침범.
- `specs/product-harness.md` — Layer 1 연관. Judge 범위 밖.
- `specs/judge-harness-design.md` — Judge 시스템 자체. 자기 수정 금지.
- `sql/` 폴더의 검증 스크립트 — 이미 PASS 상태.
- `~/.claude/skills/hackathon-judge/` — Judge 자체 코드. Cycle 안에서 자기 수정 금지.

## effort 판단 기준

| effort | 기준 | 예시 |
|--------|------|------|
| low | < 10 LOC 변경, 기존 섹션 내부에서 문장 추가/수정 | spec §1에 문장 1개 추가 |
| medium | < 50 LOC 변경, 새 섹션 생성 or 함수 시그니처 변경 | 새 Python 함수 작성, spec 새 표 추가 |
| high | ≥ 50 LOC 변경, 새 파일 or 아키텍처 변경 | 발표 스크립트 첫 생성, 새 모듈 파일 |

## expected_score_delta 계산

체크포인트 1개당 기여 점수 (rubric §체크포인트 총 개수 확인 섹션 참조):
- 창의성/Snowflake/AI: **2.08**
- 현실성: **1.25**
- 발표: **0.83**

여러 체크포인트를 동시에 해결하는 경우 합산 가능.

**예**: 발표 스크립트 1개 파일 생성으로 P1.1/P1.2/P1.3/P1.4 + P2.1/P2.2/P2.3 + P3.1/P3.2/P3.3 = 10개 체크포인트 통과 → `10 × 0.83 = 8.3`점.

이 경우 effort는 "high" (새 파일)이고 `roi = 8.3 / 9 ≈ 0.92`. 다른 low effort action보다 절대 점수는 크지만 ROI는 낮을 수 있음.

## 한 cycle에서 고르는 전략

Judge는 한 cycle당 최대 5개 action items만 생성한다. 선택 전략:

1. **ROI 내림차순** 기본 — 작은 노력으로 큰 점수 올리는 항목 우선
2. **단, 발표 스크립트 부재는 최우선** — P1~P3가 모두 0점이면 cycle 1의 첫 action은 무조건 "발표 스크립트 생성"
3. **중복 파일 수정 피하기** — 5개 action 중 같은 파일 수정이 3개 이상이면 1개 action으로 병합

## Dry-run diff 출력 (auto-impl 직전)

Judge가 action을 내면, 스킬은 각 action을 실제 diff 형식으로 변환해서 사용자에게 보여준다:

```
=== Action 1 (ROI 2.08) ===
File: specs/moving-simulator-spec.md
Section: §1
Effort: low
Expected delta: +2.08

--- before ---
Snowflake Marketplace에 부동산 시세(Richgo), 소비 데이터(SPH), 통신 계약(아정당) 세 종류의 데이터가 존재하지만 아무도 연결하지 않았다.

+++ after +++
Snowflake Marketplace에 부동산 시세(Richgo), 소비 데이터(SPH), 통신 계약(아정당) 세 종류의 데이터가 존재하지만 아무도 연결하지 않았다.
**연결 방법**: Richgo SGG(한글)와 SPH CITY_CODE(숫자, 예: 서초구=11650)를 시군구 한글명으로 교차 매칭해 하나의 의사결정 흐름으로 묶는다.
```

사용자는 5개 diff를 훑고 한 번에 `OK` or `STOP`.

## 실패 action 처리

cycle N에서 어떤 action이 적용 실패(파일 없음, 섹션 찾기 실패 등)하면:
- 해당 action을 skipped로 기록 → `cycle-N-actions.json`에 reason 포함
- 다음 cycle 재평가 시 같은 체크포인트가 여전히 FAIL이면 다른 접근으로 새 action 생성
- 같은 action이 3 cycle 연속 실패하면 → 수동 개입 필요 플래그
