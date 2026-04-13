#!/usr/bin/env python3
"""
Hackathon Judge — Cycle Runner (Phase 3-4)

Evidence.json을 입력으로 받아 Cortex LLM에 5회 호출(카테고리별) → 점수 집계 → report/actions 산출.

사용법:
    python3 run_cycle.py <cycle_number>

전제:
    collect_evidence.py가 이미 cycle-<N>-evidence.json을 생성한 상태

출력:
    state/judge-reports/cycle-<N>-report.json    — 구조화된 결과
    state/judge-reports/cycle-<N>-report.md      — 사람용 요약
    state/judge-reports/cycle-<N>-actions.json   — ROI 정렬된 top 5 action items
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

SKILL_DIR = Path(__file__).parent
PROJECT_ROOT = Path("/Users/chowonjae/Desktop/projects/snowflake")
REPORTS_DIR = PROJECT_ROOT / "state" / "judge-reports"

CATEGORIES = [
    ("창의성", "C", 25.0),
    ("Snowflake 전문성", "S", 25.0),
    ("AI 전문성", "A", 25.0),
    ("현실성", "R", 15.0),
    ("발표 및 스토리텔링", "P", 10.0),
    ("Flagship Bonus", "FB", 15.0),  # rubric v2 — Phase G-5에서 추가 (Approach H)
]

# Base 100pt (C+S+A+R+P) + Bonus 15pt (FB) = max 115. User Done 기준 = total >= 80.
BASE_CATEGORIES = {"C", "S", "A", "R", "P"}
BONUS_CATEGORIES = {"FB"}

# ============================================================
# Rubric parsing
# ============================================================

def extract_category_section(rubric_text: str, category_name: str) -> str:
    """rubric.md에서 카테고리 섹션 추출 (## 카테고리 X: {name} 부터 다음 ## 전까지).

    v2: Flagship Bonus는 "## 카테고리 6: Flagship Bonus" 형태로도 매칭 가능.
    """
    # 카테고리 6(FB)는 이름이 길어서 부분 매칭 필요
    if "Flagship Bonus" in category_name or category_name == "Flagship Bonus":
        pattern = r"## 카테고리 6: Flagship Bonus.*?(?=## 체크포인트 총 개수|## v2 채점|$)"
    else:
        pattern = rf"## 카테고리 \d+: {re.escape(category_name)}.*?(?=## 카테고리 \d+:|## 체크포인트 총 개수|$)"
    m = re.search(pattern, rubric_text, re.DOTALL)
    if not m:
        return ""
    return m.group(0).strip()


# ============================================================
# Evidence subset
# ============================================================

def evidence_for_category(evidence: dict, category_prefix: str) -> dict:
    """카테고리별로 관련 증거 필드만 추출 (프롬프트 크기 축소)."""
    tier1 = evidence.get("tier1", {})
    tier2 = evidence.get("tier2", {})
    tier3 = evidence.get("tier3", {})

    # 모든 카테고리에 공통
    base: dict = {
        "code_files": tier1.get("code_files", {}),
        "findings": tier1.get("findings", {}),
        "claude_md": tier1.get("claude_md", {}),
    }

    if category_prefix == "C":  # 창의성
        base["specs"] = {
            k: {kk: vv for kk, vv in v.items() if kk != "raw"}
            for k, v in tier1.get("specs", {}).items()
        }
        # spec raw 텍스트는 핵심 파일만 (spec.md)
        spec_md = tier1.get("specs", {}).get("moving-simulator-spec.md", {})
        base["spec_raw"] = spec_md.get("raw", "")[:8000]
    elif category_prefix == "S":  # Snowflake
        base["db"] = tier2.get("db", {})
        base["sis"] = tier2.get("sis", {})
        spec_md = tier1.get("specs", {}).get("moving-simulator-spec.md", {})
        base["spec_raw"] = spec_md.get("raw", "")[:6000]
    elif category_prefix == "A":  # AI
        base["db"] = tier2.get("db", {})
        base["sis"] = tier2.get("sis", {})
    elif category_prefix == "R":  # 현실성
        base["db"] = tier2.get("db", {})
        base["sis"] = tier2.get("sis", {})
        spec_md = tier1.get("specs", {}).get("moving-simulator-spec.md", {})
        base["spec_raw"] = spec_md.get("raw", "")[:4000]
    elif category_prefix == "P":  # 발표
        base["presentation"] = tier3.get("presentation", {})
    elif category_prefix == "FB":  # Flagship Bonus (v2)
        # FB는 queries.py 코드 상세 + SiS 전체 상태 + DB forecast 상태 모두 필요
        queries_file = tier1.get("code_files", {}).get("app/queries.py", {})
        base["queries_py_details"] = queries_file
        base["streamlit_app_details"] = tier1.get("code_files", {}).get("app/streamlit_app.py", {})
        base["db"] = tier2.get("db", {})
        base["sis"] = tier2.get("sis", {})

    return base


# ============================================================
# LLM call
# ============================================================

def call_judge(conn, persona: str, rubric_section: str, evidence_subset: dict, category: str) -> str:
    """Cortex TRY_COMPLETE 2-arg form 호출."""
    prompt = f"""{persona}

---

평가 대상 카테고리: **{category}**

이 카테고리의 체크포인트만 판정한다. 다른 카테고리는 절대 언급 금지.

---

## 루브릭 (이 카테고리만)

{rubric_section}

---

## 증거 (JSON)

```json
{json.dumps(evidence_subset, ensure_ascii=False, indent=2)[:12000]}
```

---

위 루브릭의 각 체크포인트를 증거로 판정하고, 지정된 JSON 형식으로만 출력하라.
마크다운 코드 블록이나 설명 금지. 첫 글자는 `{{` 이어야 한다."""

    cur = conn.cursor()
    cur.execute("SELECT SNOWFLAKE.CORTEX.TRY_COMPLETE('llama3.1-70b', %s)", (prompt,))
    row = cur.fetchone()
    cur.close()
    return row[0] if row and row[0] else ""


def parse_judge_json(raw: str) -> dict:
    """LLM 응답에서 JSON만 추출 (마크다운 블록/텍스트 혼입 대응)."""
    text = raw.strip()
    # remove markdown code fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    # find first { and matching last }
    first = text.find("{")
    last = text.rfind("}")
    if first < 0 or last < 0 or last <= first:
        raise ValueError(f"No JSON object found in response: {raw[:200]}")

    candidate = text[first : last + 1]
    return json.loads(candidate)


# ============================================================
# Report generation
# ============================================================

def generate_report_md(cycle: int, report: dict, prev_score: float | None) -> str:
    total = report["total_score"]
    base = report.get("base_score", total)
    bonus = report.get("bonus_score", 0)
    delta = ""
    if prev_score is not None:
        diff = total - prev_score
        sign = "+" if diff >= 0 else ""
        delta = f" ({sign}{diff:.1f} from cycle {cycle-1})"

    # v2: base + bonus 분리 표시
    max_total = 115  # 100 base + 15 bonus
    lines = [
        f"# Judge Cycle {cycle} Report",
        "",
        f"**Total: {total:.1f} / {max_total}**{delta}",
        f"  - Base: {base:.1f} / 100",
        f"  - Flagship Bonus: {bonus:.1f} / 15",
        f"**Timestamp**: {report['timestamp']}",
        "",
        "## Scores by Category",
        "| 카테고리 | 점수 | 배점 | 달성률 | 구분 |",
        "|---------|------|------|--------|------|",
    ]

    for name, prefix, weight in CATEGORIES:
        cat = report["categories"].get(name) or report["categories"].get(prefix) or {}
        score = cat.get("category_score", cat.get("score", 0))
        pct = (score / weight * 100) if weight else 0
        kind = "Bonus" if prefix in BONUS_CATEGORIES else "Base"
        lines.append(f"| {name} | {score:.1f} | {weight:.0f} | {pct:.0f}% | {kind} |")

    lines.extend(["", "## Failed Checkpoints", ""])
    fail_count = 0
    for cat_name, cat_data in report["categories"].items():
        for item_id, item in (cat_data.get("items") or {}).items():
            for cp in item.get("checkpoints", []):
                if cp.get("result") == "FAIL":
                    fail_count += 1
                    reason = cp.get("reason", "")
                    lines.append(f"- **{cp.get('id', '?')}** ({cat_name}): {reason[:150]}")
    if fail_count == 0:
        lines.append("_No failures._")

    lines.extend(["", f"_Total failed: {fail_count}_", "", "## Action Items (ROI sorted)", ""])
    actions = report.get("action_items", [])
    for i, a in enumerate(actions, 1):
        lines.append(
            f"**{i}. [{a.get('target_checkpoint','?')}]** "
            f"`{a.get('target_file','?')}` {a.get('target_section','')}"
        )
        lines.append(f"   - {a.get('change_description','')}")
        lines.append(
            f"   - delta: +{a.get('expected_score_delta',0):.2f}, "
            f"effort: {a.get('effort','?')}, roi: {a.get('roi',0):.2f}"
        )
        lines.append("")

    return "\n".join(lines)


# ============================================================
# Main
# ============================================================

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("cycle", type=int)
    parser.add_argument(
        "--fb-only",
        action="store_true",
        help="Flagship Bonus 카테고리만 평가 (F33: Base는 LLM noise 큼). Cycle 시간 6배→1배.",
    )
    args = parser.parse_args()
    n = args.cycle

    evidence_path = REPORTS_DIR / f"cycle-{n}-evidence.json"
    if not evidence_path.exists():
        print(f"[judge] ERROR: {evidence_path} not found. Run collect_evidence.py first.", file=sys.stderr)
        return 1

    evidence = json.loads(evidence_path.read_text())
    rubric = (SKILL_DIR / "rubric.md").read_text()
    persona = (SKILL_DIR / "references" / "judge-persona.md").read_text()

    try:
        import snowflake.connector
    except ImportError:
        print("[judge] ERROR: snowflake-connector-python not installed.", file=sys.stderr)
        return 1

    print(f"[judge] Cycle {n} — connecting to Snowflake...", file=sys.stderr)
    conn = snowflake.connector.connect(connection_name="enzo-pat")

    report: dict = {
        "cycle": n,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "categories": {},
        "action_items": [],
    }

    total_score = 0.0
    base_score = 0.0
    bonus_score = 0.0
    all_actions: list[dict] = []

    # FB-only 모드 (F33): Base 카테고리 LLM 호출 skip, Flagship Bonus만 평가
    categories_to_run = CATEGORIES
    if args.fb_only:
        categories_to_run = [c for c in CATEGORIES if c[1] in BONUS_CATEGORIES]
        print("[judge] --fb-only mode: skipping Base categories (F33: LLM noise)", file=sys.stderr)

    for name, prefix, weight in categories_to_run:
        print(f"[judge] Evaluating {name}...", file=sys.stderr)
        rubric_section = extract_category_section(rubric, name)
        if not rubric_section:
            print(f"[judge] WARN: rubric section for {name} not found", file=sys.stderr)
            continue

        ev_subset = evidence_for_category(evidence, prefix)

        try:
            raw = call_judge(conn, persona, rubric_section, ev_subset, name)
            parsed = parse_judge_json(raw)
        except Exception as e:
            print(f"[judge] {name} eval failed: {e}", file=sys.stderr)
            # Store raw response for debugging
            (REPORTS_DIR / f"cycle-{n}-{prefix}-raw.txt").write_text(raw if 'raw' in dir() else str(e))
            parsed = {"category": name, "category_score": 0.0, "category_total": weight, "items": {}, "action_items": []}

        # Scoring 정합성: 항상 체크포인트 PASS rate로 재계산 (LLM category_score 무시).
        # 이유: LLM이 "12개 CP 모두 FAIL"이라고 응답하면서 동시에 "category_score 6.7" 반환 케이스 발견 (cycle 2).
        # 규칙에 따라 엄격 재계산: 각 item weight × (PASS 수 / 전체 CP 수)
        items = parsed.get("items") or {}
        computed_cat_score = 0.0
        for item_id, item in items.items():
            cps = item.get("checkpoints") or []
            if not cps:
                continue
            pass_count = sum(1 for cp in cps if cp.get("result") == "PASS")
            total_count = len(cps)
            item_weight = float(item.get("weight", 0))
            if item_weight == 0:
                # weight 누락 시 rubric 기본값 추정
                item_weight = {"C": 8.33, "S": 8.33, "A": 8.33, "R": 5.0, "P": 3.33, "FB": 3.75}.get(prefix, 0)
            item_score = (pass_count / total_count) * item_weight if total_count > 0 else 0
            # LLM이 기록한 item.score를 override
            item["score"] = round(item_score, 2)
            item["computed_pass_rate"] = f"{pass_count}/{total_count}"
            computed_cat_score += item_score

        # LLM 원래 값도 보존 (디버깅용)
        if "category_score" in parsed:
            parsed["llm_reported_score"] = parsed["category_score"]
        parsed["category_score"] = round(computed_cat_score, 2)
        cat_score = computed_cat_score

        report["categories"][name] = parsed
        cat_val = float(cat_score or 0)
        total_score += cat_val
        if prefix in BONUS_CATEGORIES:
            bonus_score += cat_val
        else:
            base_score += cat_val

        for action in parsed.get("action_items") or []:
            action["category"] = name
            # ROI calc
            effort_score = {"low": 1, "medium": 3, "high": 9}.get(action.get("effort", "medium"), 3)
            delta = float(action.get("expected_score_delta", 0))
            action["roi"] = round(delta / effort_score, 2)
            all_actions.append(action)

        print(f"[judge] {name}: {float(cat_score or 0):.1f} / {weight:.0f}", file=sys.stderr)

    conn.close()

    # Top 5 actions by ROI
    all_actions.sort(key=lambda a: a.get("roi", 0), reverse=True)
    report["action_items"] = all_actions[:5]
    report["total_score"] = round(total_score, 1)
    report["base_score"] = round(base_score, 1)
    report["bonus_score"] = round(bonus_score, 1)

    # Write json
    report_json_path = REPORTS_DIR / f"cycle-{n}-report.json"
    report_json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))

    # Previous cycle score (for delta)
    prev_score = None
    if n > 1:
        prev_path = REPORTS_DIR / f"cycle-{n-1}-report.json"
        if prev_path.exists():
            prev = json.loads(prev_path.read_text())
            prev_score = prev.get("total_score")

    # Write md
    report_md_path = REPORTS_DIR / f"cycle-{n}-report.md"
    report_md_path.write_text(generate_report_md(n, report, prev_score))

    # Write actions json (separate for easy reading)
    actions_path = REPORTS_DIR / f"cycle-{n}-actions.json"
    actions_path.write_text(json.dumps({"cycle": n, "actions": report["action_items"]}, ensure_ascii=False, indent=2))

    print(f"[judge] === Cycle {n} complete ===", file=sys.stderr)
    print(f"[judge] Total: {report['total_score']:.1f} / 115 (base {report['base_score']:.1f}/100 + bonus {report['bonus_score']:.1f}/15)", file=sys.stderr)
    print(f"[judge] Report: {report_md_path}", file=sys.stderr)
    print(str(report_md_path))
    return 0


if __name__ == "__main__":
    sys.exit(main())
