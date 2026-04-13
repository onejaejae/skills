---
name: hackathon-judge
description: Snowflake Korea Hackathon 2026 테크트랙 공식 평가 기준(5 카테고리 × 3 항목 × 4 체크포인트 = 60점 루브릭)으로 제품을 지속 평가/개선한다. 증거 기반 체크포인트 채점 → action plan 생성 → dry-run diff → 사용자 승인 → 일괄 구현 → 재평가 루프. 95점 달성 OR 3 cycle 수렴 OR 마감 4시간 전 종료. 이 프로젝트(이사 결정 AI 시뮬레이터) 전용.
---

# Hackathon Judge

Snowflake Korea Hackathon 2026 테크트랙 전용 Judge 시스템. 공식 평가 기준을 체크포인트 기반으로 기계적 평가 → 피드백 → 자동 구현 → 재평가까지 완결 루프.

**설계 문서**: `/Users/chowonjae/Desktop/projects/snowflake/specs/judge-harness-design.md` (6 라운드 deep-interview 결과, 반드시 읽고 시작)

## When to Use

이 스킬은 아래 조건 모두 만족 시 호출한다:

- Phase G-2 이후 (설계 완료 상태)
- 현재 시점이 마감 4시간 이전 (2026-04-12 마감)
- 최소 1개 cycle을 끝까지 돌릴 시간 있음 (cycle당 ~15분 소요)

호출하지 말 것:
- 다른 프로젝트 — 이 스킬은 이 해커톤 전용
- 설계 문서 미확인 상태
- SiS 배포 실패 상태 (먼저 sis-verifier로 복구)

## Core Flow

```
Evidence Collection (deterministic)
    ↓
Judge Evaluation (5 category × 1 LLM call each)
    ↓
Action Plan Generation (ROI top 5)
    ↓
Dry-run Diff Output
    ↓
사용자 승인 (OK / STOP)
    ↓ OK
Batch Implementation
    ↓
Re-evaluation (Cycle N+1)
    ↓
Termination Check (95점 OR 수렴 OR 시간 상한)
```

## Prerequisites

호출 전 확인:

1. **환경**
   - Python 3 + `snowflake-connector-python` 설치
   - `~/.snowflake/connections.toml`의 `enzo-pat` 연결 동작
   - chromux 실행 중 + SiS 앱 로그인 상태 (Tier 2 SiS 수집용)

2. **파일 존재**
   - `~/.claude/skills/hackathon-judge/rubric.md` ✅ (이 스킬 자체)
   - `~/.claude/skills/hackathon-judge/collect_evidence.py` ✅
   - `/Users/chowonjae/Desktop/projects/snowflake/state/judge-reports/` 디렉토리 (없으면 생성)

3. **기초 산출물**
   - `specs/moving-simulator-spec.md` 존재
   - `app/streamlit_app.py` + `app/queries.py` + `app/config.py` 존재
   - `state/findings.md` 존재

4. **설계 문서 읽기**
   - `specs/judge-harness-design.md` (호출 시 반드시 읽기)

## Protocol

### Phase 1: 준비

1. 설계 문서 읽기: `specs/judge-harness-design.md` (10K 토큰 상한, 필요 시 offset/limit)
2. 이전 cycle 확인: `ls state/judge-reports/cycle-*-report.json | sort -V | tail -1`
   - 없으면 → cycle 1 시작
   - 있으면 → 다음 번호로 cycle N+1 진행
3. 시간 확인: 마감(2026-04-12 TBD)까지 4시간 이상 남았는지 확인. 부족하면 종료 판정 후 중단.

### Phase 2: Evidence Collection

```bash
python3 ~/.claude/skills/hackathon-judge/collect_evidence.py <N>
```

결과: `state/judge-reports/cycle-<N>-evidence.json`

**실패 대응**:
- `snowflake-connector-python` import 에러 → `pip3 install --user snowflake-connector-python` 안내 후 중단
- Tier 2 SiS 실패 (chromux 부재 등) → `--skip-sis` 플래그로 재실행. SiS 관련 체크포인트는 FAIL 처리.
- Tier 2 DB 실패 (connection 문제) → `--skip-db`로 재실행. DB 체크포인트는 FAIL.

### Phase 3: Judge Evaluation (LLM 5회 호출)

`rubric.md`와 `references/judge-persona.md`를 읽고, 카테고리별로 Cortex LLM 호출:

**호출 템플릿** (Python):

```python
import snowflake.connector
import json
from pathlib import Path

SKILL = Path.home() / ".claude/skills/hackathon-judge"
PROJECT = Path("/Users/chowonjae/Desktop/projects/snowflake")
N = 1  # current cycle

persona = (SKILL / "references/judge-persona.md").read_text()
rubric_full = (SKILL / "rubric.md").read_text()
evidence = json.loads((PROJECT / f"state/judge-reports/cycle-{N}-evidence.json").read_text())

conn = snowflake.connector.connect(connection_name="enzo-pat")
cur = conn.cursor()

results = {}
for category in ["창의성", "Snowflake 전문성", "AI 전문성", "현실성", "발표 및 스토리텔링"]:
    # rubric에서 해당 카테고리 섹션만 추출
    section_start = rubric_full.find(f"## 카테고리")
    # (섹션 추출 로직)
    rubric_section = extract_category(rubric_full, category)

    prompt = f"""{persona}

평가 대상 카테고리: {category}

[루브릭]
{rubric_section}

[증거 JSON]
{json.dumps(evidence, ensure_ascii=False, indent=2)}

위 루브릭의 체크포인트를 하나씩 판정하고, 지정된 JSON 형식으로만 출력하라.
다른 카테고리는 절대 언급하지 말라.
"""

    cur.execute(
        "SELECT SNOWFLAKE.CORTEX.TRY_COMPLETE('llama3.1-70b', %s)",
        (prompt,)
    )
    response = cur.fetchone()[0]
    # JSON 파싱 (마크다운 코드 블록 제거)
    response_clean = response.strip().lstrip("```json").rstrip("```").strip()
    results[category] = json.loads(response_clean)

cur.close()
conn.close()
```

**F18 주의**: TRY_COMPLETE는 **2-arg form만** 사용. `(model, prompt)`. 3-arg OBJECT form 금지.

### Phase 4: Report Generation

`cycle-<N>-report.json` 생성 (구조화):

```json
{
  "cycle": 1,
  "timestamp": "2026-04-11T16:00:00Z",
  "total_score": 67.5,
  "categories": { ... },
  "action_items": [ ... ]
}
```

`cycle-<N>-report.md` 생성 (사람용 요약):

```markdown
# Judge Cycle N Report

**Total: 67.5 / 100**

| 카테고리 | 점수 | 배점 | 달성률 |
|---------|------|------|--------|
| 창의성 | 17.5 | 25 | 70% |
| Snowflake | 20.0 | 25 | 80% |
| AI | 15.0 | 25 | 60% |
| 현실성 | 12.0 | 15 | 80% |
| 발표 | 3.0 | 10 | 30% |

## Failed Checkpoints (상위 5)
...

## Action Items (ROI 내림차순)
...

## 다음 Cycle 예상 점수
67.5 → 73.5 (+6.0, top 5 action 실행 시)
```

### Phase 5: Dry-Run Diff

`cycle-<N>-actions.json`의 상위 5개 action을 diff 형식으로 변환:

```
=== Action 1 (ROI 2.08) ===
File: specs/moving-simulator-spec.md §1
Effort: low (+2.08)

--- before ---
...

+++ after +++
...
```

**사용자 승인 요청** (텍스트 출력만):

```
위 5개 action을 적용하시겠습니까?
- "OK" → 일괄 구현 후 cycle N+1 시작
- "STOP" → 중단, 사용자 직접 검토
- 특정 번호 제외 원하시면 "OK except 3" 형식
```

### Phase 6: Batch Implementation (사용자 OK 시)

각 action을 Edit/Write tool로 순차 적용. 실패 시 해당 action만 skipped로 기록, 나머지 계속.

적용 후:
1. sis-verifier로 `errors` 체크 — 새 에러 0 확인
2. `cycle-<N>-actions.json`의 각 action에 `applied: true/false` + `skipped_reason` 추가

### Phase 7: Termination Check

```python
def check_termination(cycle_n, reports_dir):
    # 가장 최근 report 읽기
    current = load_report(cycle_n)
    if current["total_score"] >= 95:
        return "DONE", "95점 달성"

    # 3 cycle 연속 <1점 변화
    if cycle_n >= 3:
        r1 = load_report(cycle_n - 2)
        r2 = load_report(cycle_n - 1)
        r3 = current
        if abs(r2["total_score"] - r1["total_score"]) < 1 and abs(r3["total_score"] - r2["total_score"]) < 1:
            return "CONVERGED", "3 cycle 연속 변화 <1점"

    # 마감 4시간 전
    deadline = datetime(2026, 4, 12, 18, 0)  # TBD 정확 시간
    if deadline - datetime.now() < timedelta(hours=4):
        return "TIME_LIMIT", "마감 4시간 전 강제 종료"

    return "CONTINUE", None
```

종료 판정 후:
- `CONTINUE` → 다음 cycle (사용자 승인 후)
- 그 외 → 최종 리포트 출력, 다음 단계 제안 (영상 녹화, 제출 준비)

## Gotchas

| 함정 | 대응 |
|---|---|
| LLM이 JSON 밖 텍스트 섞어 응답 | `json.loads()` 전에 ```json ... ``` 블록 추출 또는 첫/마지막 `{` / `}` 기준 slicing |
| 5회 LLM 호출 토큰 비용 | cycle당 ~25K 토큰. Cortex 무료 tier로 커버 가능. 여러 cycle 시 monitoring |
| 같은 action 반복 제안 (고착) | Phase 6에서 `applied` 플래그 확인. 이미 적용된 action은 다음 cycle 증거에 반영됐으면 자동 해소 |
| SiS iframe 못 찾음 | `--skip-sis`로 재실행. SiS 관련 체크포인트 FAIL 감수 |
| findings.md에 있어야 할 F# 참조 누락 | evidence.json의 `has_fXX` 필드로 확인 가능 |
| Judge가 rubric 외 체크포인트 추가 | persona 원칙 #6 위반. 결과 파싱 후 rubric ID만 필터링 |
| action target_file이 금지 파일 (CLAUDE.md 등) | action-guide.md §절대 건드리지 말 것 목록. Phase 6 전에 필터링 |
| max_tokens 기본값 부족 (긴 응답 truncate) | 프롬프트 분할 — 1 카테고리 = 1 호출이면 ~2000 토큰 출력 여유 있음 |
| 발표 스크립트 부재로 P1~P3 항상 0점 | cycle 1의 첫 action으로 "presentation-script.md 생성" 자동 배치. action-guide 참조 |

## Output Expectations

사용자는 이 스킬 호출 후 다음을 받는다:

```markdown
## Judge Cycle <N> 완료

- 총점: XX.X / 100 (이전 cycle 대비 +X.X)
- 상태: CONTINUE / DONE / CONVERGED / TIME_LIMIT
- Action Items: 상위 5개 diff (Phase 5 출력)

### 다음 단계
- [CONTINUE] "OK" 입력 → 일괄 구현 + cycle N+1 시작
- [DONE/CONVERGED/TIME_LIMIT] 최종 제출 준비 (영상, zip, Forms)
```

## Files

- `rubric.md` — 60 체크포인트 (수정 가능, 다음 cycle부터 반영)
- `references/judge-persona.md` — LLM 호출 시 서두 삽입
- `references/action-guide.md` — action item 생성 규칙
- `collect_evidence.py` — Tier 1+2+3 수집기 (deterministic)

## Related

- `specs/judge-harness-design.md` — 6 라운드 deep-interview 설계 문서 (진실 원천)
- `specs/hackathon-self-review.md` — F25 초기 self-review (기초 점수 67.5)
- `state/findings.md` — F25, F28, F29 등 Judge 시스템 관련 이력
- `CLAUDE.md` — 4-Layer 원칙 (Judge는 외부 애드온)
