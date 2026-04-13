#!/usr/bin/env python3
"""
Hackathon Judge — Evidence Collector (Tier 1+2+3)

Deterministic 증거 수집. LLM 호출 금지 — 같은 상태 → 같은 JSON.

사용법:
    python3 collect_evidence.py <cycle_number> [--skip-sis] [--skip-db]

출력:
    state/judge-reports/cycle-<N>-evidence.json

Tiers:
    1: 파일 시스템 (코드/스펙/findings)
    2: Snowflake DB (SiS + 데모 시나리오 SQL)
    3: 발표 스크립트 (있으면)
"""
from __future__ import annotations

import argparse
import ast
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path("/Users/chowonjae/Desktop/projects/snowflake")
REPORTS_DIR = PROJECT_ROOT / "state" / "judge-reports"
SIS_HELPER = Path.home() / ".claude" / "skills" / "sis-verifier" / "cdp_helper.py"


# ============================================================
# Tier 1: File system
# ============================================================

def collect_code_file(path: Path) -> dict:
    """Python 파일의 정적 지표 추출."""
    if not path.exists():
        return {"exists": False}

    text = path.read_text(encoding="utf-8", errors="replace")
    lines = text.splitlines()

    # Flagship v2 detection (F39 — rubric v2 Flagship Bonus category)
    forecast_periods_match = re.search(r"FORECASTING_PERIODS\s*=>\s*(\d+)", text)
    max_forecast_periods = int(forecast_periods_match.group(1)) if forecast_periods_match else 0
    # 추가로 config.py의 FORECAST_PERIODS 상수 사용한 경우도 탐지
    if "FORECAST_PERIODS" in text and "FORECASTING_PERIODS" in text:
        max_forecast_periods = max(max_forecast_periods, 6)  # config.py 기본값

    info: dict = {
        "exists": True,
        "loc": len(lines),
        "try_complete_calls": len(re.findall(r"SNOWFLAKE\.CORTEX\.TRY_COMPLETE", text)),
        "complete_calls_raw": len(re.findall(r"SNOWFLAKE\.CORTEX\.COMPLETE\s*\(", text)),
        "sql_queries": len(re.findall(r"session\.sql\s*\(", text)),
        "cortex_forecast_calls": len(re.findall(r"FORECAST\!FORECAST|CALL\s+\w+\.\w+\.\w+\!FORECAST", text, re.IGNORECASE)),
        "mini_agent_flow": "mini_agent_query" in text,
        "has_sql_injection_guard": bool(
            re.search(r"forbidden\s*=.*DROP.*DELETE", text)
            or re.search(r"\bforbidden\b.*re\.search", text)
        ),
        "has_korean_prompt": "한국어" in text,
        "has_domain_context": "의료" in text or "뷰티" in text or "domain_context" in text,
        # Flagship v2
        "forecast_periods_max": max_forecast_periods,
        "forecast_5yr_query": max_forecast_periods >= 60,  # 60 months = 5 years
        "population_movement_query": "REGION_POPULATION_MOVEMENT" in text,
        "future_narrative_function": bool(
            re.search(r"def\s+(generate_future_narrative|generate_5yr|query_5yr|future_forecast|long_term)", text)
        ),
        "climax_section_marker": bool(
            re.search(r"Climax|5\ub144\s*후|\ubbf8\ub798\s*\uc2dc\ubbac|future.*section", text, re.IGNORECASE)
        ),
    }

    # AST 기반 함수/import 추출
    try:
        tree = ast.parse(text)
        info["functions"] = [
            node.name for node in ast.walk(tree)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        ]
        imports = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    imports.add(alias.name.split(".")[0])
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    imports.add(node.module.split(".")[0])
        info["imports"] = sorted(imports)
    except SyntaxError:
        info["functions"] = []
        info["imports"] = []
        info["parse_error"] = True

    return info


def collect_code() -> dict:
    """app/ 디렉토리의 주요 파일 수집."""
    app_dir = PROJECT_ROOT / "app"
    files = {
        "app/streamlit_app.py": app_dir / "streamlit_app.py",
        "app/queries.py": app_dir / "queries.py",
        "app/config.py": app_dir / "config.py",
    }
    return {rel: collect_code_file(p) for rel, p in files.items()}


def collect_specs() -> dict:
    """specs/ 파일의 섹션 카운트 + raw 텍스트."""
    specs_dir = PROJECT_ROOT / "specs"
    result: dict = {}

    for name in ["moving-simulator-spec.md", "moving-simulator-dev-design.md", "product-harness.md"]:
        path = specs_dir / name
        if not path.exists():
            result[name] = {"exists": False}
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        # H2 이상 헤더 수
        h1 = len(re.findall(r"^#\s", text, re.MULTILINE))
        h2 = len(re.findall(r"^##\s", text, re.MULTILINE))
        result[name] = {
            "exists": True,
            "loc": len(text.splitlines()),
            "h1_count": h1,
            "h2_count": h2,
            "raw": text,
        }
    return result


def collect_findings() -> dict:
    """findings.md 통계 + 최근 5개."""
    path = PROJECT_ROOT / "state" / "findings.md"
    if not path.exists():
        return {"exists": False}

    text = path.read_text(encoding="utf-8", errors="replace")

    # F# 매칭: `### F<n>:` 형식
    f_headers = re.findall(r"^###\s+F(\d+):.*$", text, re.MULTILINE)
    f_numbers = sorted({int(n) for n in f_headers})

    # 등급 카운트 (대괄호 또는 공백 허용)
    critical = len(re.findall(r"\[CRITICAL\]|CRITICAL\]", text))
    med = len(re.findall(r"\[MED\]", text))
    low = len(re.findall(r"\[LOW\]", text))

    # 최근 5개 F# (가장 높은 번호 5개)
    recent_ids = f_numbers[-5:] if len(f_numbers) >= 5 else f_numbers

    return {
        "exists": True,
        "total": len(f_numbers),
        "max_f_number": max(f_numbers) if f_numbers else 0,
        "recent_f_ids": recent_ids,
        "critical": critical,
        "med": med,
        "low": low,
        "has_f11": "F11" in text,
        "has_f17": "F17" in text,
        "has_f18": "F18" in text,
        "has_f21": "F21" in text,
        "has_f22": "F22" in text,
        "has_f23": "F23" in text,
        "has_f24": "F24" in text,
        "has_f29": "F29" in text,
    }


def collect_claude_md() -> dict:
    """CLAUDE.md 간단 지표."""
    path = PROJECT_ROOT / "CLAUDE.md"
    if not path.exists():
        return {"exists": False}
    text = path.read_text(encoding="utf-8", errors="replace")
    return {
        "exists": True,
        "loc": len(text.splitlines()),
        "has_demo_protection": "5분 데모 보호" in text,
        "has_warehouse_section": "COMPUTE_WH" in text or "warehouse" in text.lower(),
        "has_absolute_rules": "절대 규칙" in text,
    }


# ============================================================
# Tier 2: Snowflake DB + SiS
# ============================================================

def collect_db_state() -> dict:
    """Snowflake DB 상태 — Python connector 직접 호출."""
    try:
        import snowflake.connector
    except ImportError:
        return {"error": "snowflake-connector-python not installed"}

    try:
        conn = snowflake.connector.connect(connection_name="enzo-pat")
        cur = conn.cursor()

        result: dict = {}

        # Forecast 모델 존재 — SHOW SNOWFLAKE.ML.FORECAST 또는 테스트 PREDICT 호출로 확인
        try:
            cur.execute("""
                SELECT COUNT(*)
                FROM MOVING_SIM.INFORMATION_SCHEMA.TABLES
                WHERE TABLE_SCHEMA = 'RAW' AND TABLE_NAME ILIKE '%FORECAST%'
            """)
            row = cur.fetchone()
            found_by_info = int(row[0]) if row else 0
            # Fallback: try to actually CALL the forecast model (short, 1 period)
            try:
                cur.execute("""
                    SELECT COUNT(*) FROM TABLE(
                        MOVING_SIM.RAW.MOVING_JEONSE_FORECAST!FORECAST(FORECASTING_PERIODS => 1)
                    )
                """)
                row2 = cur.fetchone()
                result["forecast_model_exists"] = (row2 and int(row2[0]) > 0)
                result["forecast_predict_rows"] = int(row2[0]) if row2 else 0
            except Exception as e2:
                # If INFORMATION_SCHEMA showed it, trust that
                result["forecast_model_exists"] = found_by_info > 0
                result["forecast_predict_error"] = str(e2)[:200]
            result["forecast_info_schema_count"] = found_by_info
        except Exception as e:
            result["forecast_model_exists"] = False
            result["forecast_error"] = str(e)[:200]

        # Semantic view 수
        try:
            cur.execute("SHOW SEMANTIC VIEWS IN SCHEMA MOVING_SIM.SEMANTIC")
            sv = cur.fetchall()
            result["semantic_view_count"] = len(sv)
        except Exception as e:
            result["semantic_view_count"] = 0
            result["semantic_error"] = str(e)[:200]

        # Streamlit 앱 존재
        try:
            cur.execute("SHOW STREAMLITS IN SCHEMA MOVING_SIM.AGENTS")
            streamlits = cur.fetchall()
            result["streamlit_count"] = len(streamlits)
        except Exception as e:
            result["streamlit_count"] = 0
            result["streamlit_error"] = str(e)[:200]

        # 데모 시나리오 SQL 결과 — 5건 반환되는지
        try:
            cur.execute("""
                SELECT COUNT(*) FROM (
                    SELECT d.DANJI_ID
                    FROM KOREA_REAL_ESTATE_APARTMENT_MARKET_INTELLIGENCE.HACKATHON_2026.DANJI_APT_INFO d
                    JOIN KOREA_REAL_ESTATE_APARTMENT_MARKET_INTELLIGENCE.HACKATHON_2026.DANJI_APT_RICHGO_MARKET_PRICE_M_H p
                      ON d.DANJI_ID = p.DANJI_ID
                    JOIN KOREA_REAL_ESTATE_APARTMENT_MARKET_INTELLIGENCE.HACKATHON_2026.APT_DANJI_AND_TRANSPORTATION_TRAIN_DISTANCE t
                      ON d.DANJI_ID = t.DANJI_ID
                    WHERE d.SGG IN ('서초구','중구')
                      AND p.YYYYMMDD = '2026-03-01'
                      AND p.MEAN_JEONSE_PRICE BETWEEN 35000 AND 45000
                    QUALIFY ROW_NUMBER() OVER (PARTITION BY d.DANJI_ID ORDER BY t.DISTANCE) = 1
                    ORDER BY t.DISTANCE ASC
                    LIMIT 5
                )
            """)
            row = cur.fetchone()
            result["demo_scenario_rec_count"] = int(row[0]) if row else 0
        except Exception as e:
            result["demo_scenario_rec_count"] = 0
            result["demo_error"] = str(e)[:200]

        # Flagship v2: Forecast 5년 (60 months) PREDICT 가능 여부 확인
        try:
            cur.execute("""
                SELECT COUNT(*) FROM TABLE(
                    MOVING_SIM.RAW.MOVING_JEONSE_FORECAST!FORECAST(FORECASTING_PERIODS => 60)
                )
            """)
            row = cur.fetchone()
            result["forecast_5yr_predict_rows"] = int(row[0]) if row else 0
        except Exception as e:
            result["forecast_5yr_predict_rows"] = 0
            result["forecast_5yr_error"] = str(e)[:200]

        # Flagship v2: REGION_POPULATION_MOVEMENT 데이터 존재 여부 (3개 구)
        try:
            cur.execute("""
                SELECT COUNT(*)
                FROM KOREA_REAL_ESTATE_APARTMENT_MARKET_INTELLIGENCE.HACKATHON_2026.REGION_POPULATION_MOVEMENT
                WHERE BJD_CODE LIKE '11650%' OR BJD_CODE LIKE '11560%' OR BJD_CODE LIKE '11140%'
            """)
            row = cur.fetchone()
            result["population_movement_rows_3gu"] = int(row[0]) if row else 0
            result["population_movement_available"] = (row and int(row[0]) > 0)
        except Exception as e:
            result["population_movement_rows_3gu"] = 0
            result["population_movement_available"] = False
            result["population_movement_error"] = str(e)[:200]

        cur.close()
        conn.close()
        return result

    except Exception as e:
        return {"error": f"connect failed: {str(e)[:200]}"}


def collect_sis_state() -> dict:
    """sis-verifier cdp_helper 호출 — 실패해도 empty 반환."""
    if not SIS_HELPER.exists():
        return {"error": "cdp_helper not found"}

    result: dict = {"helper_exists": True}

    def run_cdp(*args: str) -> tuple[int, str]:
        try:
            proc = subprocess.run(
                ["python3", str(SIS_HELPER), *args],
                capture_output=True,
                text=True,
                timeout=30,
            )
            return proc.returncode, (proc.stdout or proc.stderr or "").strip()
        except Exception as e:
            return -1, f"cdp_helper exec error: {e}"

    # find iframe — cdp_helper returns JSON like {"found": true, "url": "..."}
    rc, out = run_cdp("find")
    try:
        find_data = json.loads(out)
        result["cp0_iframe_found"] = bool(find_data.get("found"))
        result["sis_url"] = find_data.get("url", "")[:200]
    except (json.JSONDecodeError, ValueError):
        # Fallback: substring
        result["cp0_iframe_found"] = "found" in out.lower() and "true" in out.lower()
        result["find_output_raw"] = out[:500]

    if not result["cp0_iframe_found"]:
        return result  # SiS not loaded — skip remaining

    # errors count
    rc, out = run_cdp("errors")
    m = re.search(r"(\d+)", out)
    result["cp0_errors"] = int(m.group(1)) if m else -1

    # buttons (CP1)
    rc, out = run_cdp("buttons")
    result["cp1_buttons_output"] = out[:500]
    result["cp1_buttons_found"] = "추천받기" in out or "button" in out.lower()

    # text checks — Step rendering
    for key, needle in [
        ("cp2_step1_rendered", "Step 1"),
        ("cp4_step2_rendered", "Step 2"),
        ("cp5_forecast_metric", "시세 전망"),
        ("cp6_ai_summary_present", "AI 분석 요약"),
        # Flagship v2 (새 CP)
        ("cp8_future_section_5yr", "5년"),
        ("cp8_future_section_climax", "미래"),
        ("cp9_population_movement_ui", "인구이동"),
        ("cp10_future_narrative_forecast", "전망"),
    ]:
        rc, out = run_cdp("text-contains", needle)
        result[key] = rc == 0 and ("found" in out.lower() or "contains" in out.lower() or "true" in out.lower())

    return result


# ============================================================
# Tier 3: Presentation script
# ============================================================

def collect_presentation() -> dict:
    """specs/presentation-script.md 수집 — 없으면 empty."""
    path = PROJECT_ROOT / "specs" / "presentation-script.md"
    if not path.exists():
        return {"exists": False, "raw": None}

    text = path.read_text(encoding="utf-8", errors="replace")

    return {
        "exists": True,
        "loc": len(text.splitlines()),
        "h1_count": len(re.findall(r"^#\s", text, re.MULTILINE)),
        "h2_count": len(re.findall(r"^##\s", text, re.MULTILINE)),
        "raw": text,
        "has_problem_section": bool(re.search(r"문제\s*정의|problem", text, re.IGNORECASE)),
        "has_demo_section": bool(re.search(r"데모|demo", text, re.IGNORECASE)),
        "has_tech_section": bool(re.search(r"기술\s*설명|architecture|아키텍처", text, re.IGNORECASE)),
        "has_future_section": bool(re.search(r"향후|future", text, re.IGNORECASE)),
        "has_4b_scenario": "4억" in text and "영등포" in text and "서초" in text,
        "has_cortex_mention": text.lower().count("cortex") >= 2,
        "has_marketplace_mention": "marketplace" in text.lower() or "richgo" in text.lower() or "sph" in text.lower(),
        "has_novelty_keyword": "차별화" in text or "기존과 달리" in text or "novelty" in text.lower(),
        "has_limit_keyword": "3개 구" in text or "한정" in text,
        "has_percent_number": bool(re.search(r"[+-]?\d+\s*%", text)),
        "has_step_order": "Step 1" in text and "Step 2" in text and "Step 3" in text,
    }


# ============================================================
# Main
# ============================================================

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("cycle", type=int, help="Cycle number (1, 2, 3...)")
    parser.add_argument("--skip-sis", action="store_true", help="Skip tier2 SiS collection")
    parser.add_argument("--skip-db", action="store_true", help="Skip tier2 DB collection")
    args = parser.parse_args()

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = REPORTS_DIR / f"cycle-{args.cycle}-evidence.json"

    print(f"[judge] Collecting evidence for cycle {args.cycle}...", file=sys.stderr)

    evidence: dict = {
        "cycle": args.cycle,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "tier1": {
            "code_files": collect_code(),
            "specs": collect_specs(),
            "findings": collect_findings(),
            "claude_md": collect_claude_md(),
        },
        "tier2": {
            "db": {} if args.skip_db else collect_db_state(),
            "sis": {} if args.skip_sis else collect_sis_state(),
        },
        "tier3": {
            "presentation": collect_presentation(),
        },
    }

    out_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2))
    print(f"[judge] Evidence saved: {out_path}", file=sys.stderr)
    print(str(out_path))  # stdout = path (for chaining)
    return 0


if __name__ == "__main__":
    sys.exit(main())
