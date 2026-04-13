# Hackathon Judge Rubric — Snowflake Korea Hackathon 2026 (테크트랙)

> 이 파일은 `hackathon-judge` 스킬의 핵심 자산. 수정 시 다음 cycle부터 바로 반영된다.
>
> 구조: 5 카테고리 × 3 항목 × 4 체크포인트 = 60 체크포인트, 총점 100.
> 채점: 각 항목 `(통과 / 전체) × 배점` → 카테고리 합 → 총점.
> 원칙: 모든 체크포인트는 **binary PASS/FAIL**, **증거 인용 필수**, 애매하면 FAIL.

---

## 카테고리 1: 창의성 (25점)

### C1. 기존 접근 방식과 차별화된 문제 정의/솔루션 (8.33)

- [ ] **C1.1**: 기획서 배경(§1)에 구체적 시장 규모 수치가 있다 (예: "매년 550만 가구")
  - evidence: `specs/moving-simulator-spec.md §1` 첫 2문단
  - PASS 기준: 숫자 + 단위가 명시된 문장 1개 이상
- [ ] **C1.2**: 기존 서비스(부동산 앱/지도 앱/카드 앱)의 한계가 명시적으로 대조되어 있다
  - evidence: `specs/moving-simulator-spec.md §1`
  - PASS 기준: 기존 서비스 2개 이상 + 한계점이 구체적으로 서술
- [ ] **C1.3**: 이종 데이터 3개(부동산+소비+통신) 결합의 novelty가 추상어 없이 설명된다
  - evidence: `specs/moving-simulator-spec.md §1~§2` + `app/queries.py`의 실제 조인 로직
  - PASS 기준: "연결" 같은 추상어가 아닌 구체 키(SGG/CITY_CODE 등)로 설명
- [ ] **C1.4**: 구체적 사용 시나리오(영등포→서초 신혼부부)가 숫자와 함께 제시된다
  - evidence: `specs/moving-simulator-spec.md §3`
  - PASS 기준: 예산/인원/현재구/타겟구 모두 명시 + 기대 결과 1개 이상

### C2. 문제의 배경이 타당 (8.33)

- [ ] **C2.1**: 타깃 사용자가 1개 이상 구체적으로 정의되어 있다 (유형 + 목표)
  - evidence: `specs/moving-simulator-spec.md §2` 사용자 표
  - PASS 기준: 유형/목표/주요 행동 3개 열이 채워진 행 1개 이상
- [ ] **C2.2**: 문제 해결 전/후 차이가 정량적으로 서술된다 (몇 개 앱 → 1개 앱 등)
  - evidence: `specs/moving-simulator-spec.md §1` 또는 발표 스크립트 §1
  - PASS 기준: 수치 비교 1개 이상 (예: "3개 앱 → 1개 통합")
- [ ] **C2.3**: 예외 상황(빈 결과/부족 데이터/외부 호출 실패)이 §3에 3개 이상 정의
  - evidence: `specs/moving-simulator-spec.md §3` 예외 표
  - PASS 기준: 행 수 ≥ 3 + 각 행에 시스템 동작 명시
- [ ] **C2.4**: 범위 한정 이유가 명시적으로 설명된다 (왜 3개 구인가)
  - evidence: `specs/moving-simulator-spec.md §7` 또는 배경
  - PASS 기준: "SPH 커버리지 한정" 류의 이유 문장 1개 이상

### C3. 새 아이디어 or 기존 대비 개선점 (8.33)

- [ ] **C3.1**: "이사 전 시뮬레이션"이라는 새 개념이 명시적으로 선언된다
  - evidence: `specs/moving-simulator-spec.md §1` 마지막 문단
  - PASS 기준: "새로운 가치"/"아직 없다" 류의 명시 선언
- [ ] **C3.2**: Step 구조(1 추천 → 2 소비 → 3 예측)가 순서/의미와 함께 설명된다
  - evidence: `specs/moving-simulator-spec.md §3` + `app/streamlit_app.py` Step 헤더
  - PASS 기준: 세 Step이 모두 구현되어 있고 각 Step의 역할이 명확
- [ ] **C3.3**: AI 요약의 역할이 "단순 설명"이 아닌 "의사결정 조언"으로 포지셔닝
  - evidence: `app/queries.py::generate_ai_summary` 프롬프트 + cp6_ai_summary_sample
  - PASS 기준: 프롬프트에 "조언" / "권장" 등의 단어 + 샘플 출력에 권장 행동
- [ ] **C3.4**: 서초 의료 허브 같은 도메인 인사이트가 앱/스크립트에 반영됨
  - evidence: `app/queries.py::generate_ai_summary` domain_context + spec §3 예시
  - PASS 기준: 특정 구의 특성 설명 1개 이상 코드에 존재

---

## 카테고리 2: Snowflake 전문성 (25점)

### S1. Snowflake 플랫폼/기능 활용 + 난이도 (8.33)

- [ ] **S1.1**: Cortex Forecast 모델이 생성되어 있고 SHOW FORECAST로 확인된다
  - evidence: `tier2.db.forecast_model_exists == true`
  - PASS 기준: true
- [ ] **S1.2**: Cortex LLM (TRY_COMPLETE) 호출이 코드에 2회 이상 존재
  - evidence: `tier1.code_files["app/queries.py"].try_complete_calls >= 2`
  - PASS 기준: 2 이상
- [ ] **S1.3**: Semantic View가 1개 이상 존재 (난이도 항목 — metadata layer 활용)
  - evidence: `tier2.db.semantic_view_count >= 1`
  - PASS 기준: 1 이상
- [ ] **S1.4**: Streamlit in Snowflake 배포가 성공 상태이며 sis-verifier CP0 PASS
  - evidence: `tier2.sis.cp0_errors == 0`
  - PASS 기준: 0

### S2. Snowflake 데이터 자산 기반 혁신적 활용 (8.33)

- [ ] **S2.1**: Marketplace 데이터 3개 카테고리(부동산/소비/통신)가 모두 쿼리에 쓰임
  - evidence: `app/queries.py`에 DB_RICHGO / DB_SPH / DB_TELECOM 모두 참조
  - PASS 기준: 3개 모두 참조
- [ ] **S2.2**: Marketplace 데이터 간 조인 키가 단일 소스에서 하드코딩 없이 운영
  - evidence: `app/config.py::VALID_DISTRICTS` 상수 + queries에서 참조
  - PASS 기준: 한 곳에 정의된 dict를 여러 쿼리가 참조
- [ ] **S2.3**: 지역 필터(3개 구)가 SQL WHERE 절에 실제 적용되어 CP2 결과 5건 반환
  - evidence: `tier2.db.demo_scenario_rec_count == 5`
  - PASS 기준: 5
- [ ] **S2.4**: Richgo `YYYYMMDD` ↔ SPH `STANDARD_YEAR_MONTH` 포맷 차이가 상수로 격리
  - evidence: `app/config.py`에 `LATEST_PRICE_DATE` + `SPH_RECENT_START` 모두 존재
  - PASS 기준: 두 상수 모두 존재

### S3. Snowflake 사용으로 해결 가능한 솔루션 (8.33)

- [ ] **S3.1**: 앱 전체가 Snowflake 단일 플랫폼(SiS + Cortex + Marketplace)으로 동작
  - evidence: `specs/moving-simulator-spec.md §5` 시스템 표 + SiS 배포 상태
  - PASS 기준: 외부 서비스(AWS Lambda 등) 의존성 없음
- [ ] **S3.2**: Forecast가 단지별 시계열로 학습 → PREDICT → Streamlit 차트까지 end-to-end 동작
  - evidence: `tier2.sis.cp5_forecast_metric` 값이 "만원" 단위 숫자
  - PASS 기준: 숫자 + 만원 문자열이 추출됨
- [ ] **S3.3**: 데이터 불일치 폴백(단지→동 레벨)이 정책 문서에 명시
  - evidence: `specs/moving-simulator-spec.md §8` 개발 정책 표
  - PASS 기준: "Cortex Forecast 폴백" 행 존재
- [ ] **S3.4**: SiS 런타임 특성(Snowpark quoted identifier 등)이 findings.md에 기록
  - evidence: `state/findings.md`에 F24 참조
  - PASS 기준: F24 문자열 존재

---

## 카테고리 3: AI 전문성 (25점)

### A1. Snowflake Cortex 적절한 용도 활용 (8.33)

- [ ] **A1.1**: TRY_COMPLETE 2-arg form 사용 (F18 규칙 준수)
  - evidence: `app/queries.py` grep — 3-arg OBJECT form 없음
  - PASS 기준: TRY_COMPLETE 호출 모두 2-arg
- [ ] **A1.2**: AI 요약 프롬프트에 한국어 강제 지시문 포함
  - evidence: `app/queries.py::generate_ai_summary` 프롬프트 + `LLM_LANG_PROMPT` 상수
  - PASS 기준: "한국어" 키워드 프롬프트 내 존재
- [ ] **A1.3**: Mini-Agent 패턴(LLM→SQL→실행→요약)이 구현되어 있고 SQL injection guard 존재
  - evidence: `app/queries.py::mini_agent_query` 내 forbidden 키워드 필터
  - PASS 기준: DROP/DELETE 차단 로직 존재
- [ ] **A1.4**: Forecast 호출 실패 시 과거 시세만 표시 폴백 존재
  - evidence: `app/streamlit_app.py` Step3의 except + `st.line_chart(df_past)` 폴백
  - PASS 기준: try/except 블록에서 과거 차트 호출 발견

### A2. AI/에이전트를 새 가치 창출 구조로 활용 (8.33)

- [ ] **A2.1**: AI 요약 출력 샘플이 "설명조"가 아닌 "의사결정 조언조"
  - evidence: `tier2.sis.cp6_ai_summary_sample` 문자열
  - PASS 기준: "권장" / "추천" / "조기" 등 행동 유도 단어 1개 이상
- [ ] **A2.2**: AI 요약 프롬프트가 사용자 상황(현재구/예산)을 반영
  - evidence: `app/queries.py::generate_ai_summary` 인자 + 프롬프트
  - PASS 기준: `current_sgg` 또는 `budget` 파라미터가 프롬프트에 삽입
- [ ] **A2.3**: Mini-Agent가 Semantic View 또는 스키마 컨텍스트를 프롬프트에 주입
  - evidence: `app/queries.py::SCHEMA_CONTEXT` 상수 + mini_agent_query 프롬프트
  - PASS 기준: SCHEMA_CONTEXT가 실제 프롬프트에 삽입됨
- [ ] **A2.4**: LLM 호출 실패가 전체 앱을 멈추지 않도록 TRY_COMPLETE 사용
  - evidence: `app/queries.py` 모든 LLM 호출이 `SNOWFLAKE.CORTEX.TRY_COMPLETE` 사용
  - PASS 기준: `SNOWFLAKE.CORTEX.COMPLETE(` (TRY 없는 버전) 호출 0건

### A3. AI 모델 발전 속도에 맞춘 확장성 (8.33)

- [ ] **A3.1**: LLM 모델명이 `config.py` 상수로 격리되어 있음 (교체 가능)
  - evidence: `app/config.py::LLM_MODEL` 상수 존재 + queries.py에서 참조
  - PASS 기준: 상수 정의 + 최소 1개 쿼리에서 import
- [ ] **A3.2**: Forecast 모델 파라미터가 상수로 외재화 (FORECAST_PERIODS 등)
  - evidence: `app/config.py::FORECAST_MODEL_NAME` + `FORECAST_PERIODS`
  - PASS 기준: 두 상수 모두 존재
- [ ] **A3.3**: 프롬프트 수정이 코드 레벨 단일 위치에서 가능 (하드코딩 산재 없음)
  - evidence: `app/queries.py` grep — 프롬프트 문자열이 f-string으로 한 함수에 집중
  - PASS 기준: `generate_ai_summary`에 prompt 변수 1개
- [ ] **A3.4**: 한국어 품질/모델 교체 가능성이 findings.md에 추적됨 (F17)
  - evidence: `state/findings.md`에 F17 참조
  - PASS 기준: F17 문자열 존재

---

## 카테고리 4: 현실성 (15점)

### R1. 구현물 완벽도 (5점)

- [ ] **R1.1**: sis-verifier CP0~CP6 모두 PASS 상태
  - evidence: `tier2.sis.cp0_errors == 0` + cp2/cp5/cp6 true
  - PASS 기준: 4개 필드 모두 성공
- [ ] **R1.2**: 데모 시나리오 추천 결과가 정확히 5건 (`MAX_RECOMMENDATIONS`)
  - evidence: `tier2.db.demo_scenario_rec_count == 5`
  - PASS 기준: 5
- [ ] **R1.3**: 앱 메인 파일(streamlit_app.py)이 200 LOC 이상 (불완전 스캐폴드 아님)
  - evidence: `tier1.code_files["app/streamlit_app.py"].loc >= 200`
  - PASS 기준: 200 이상
- [ ] **R1.4**: 쿼리 모듈(queries.py)이 실제 동작 함수 5개 이상
  - evidence: `tier1.code_files["app/queries.py"].functions` 수
  - PASS 기준: 5 이상

### R2. 자원/비용 합리성 + 지속 운영 가능성 (5점)

- [ ] **R2.1**: 외부 서비스 의존 없음 — Snowflake 단일 스택
  - evidence: `specs/moving-simulator-spec.md §5` 외부 시스템 표에 non-Snowflake 없음
  - PASS 기준: Snowflake 외 항목 0
- [ ] **R2.2**: 웨어하우스 절약 정책 명시 (auto-suspend / 최소 사이즈)
  - evidence: `specs/moving-simulator-spec.md §8` 또는 `CLAUDE.md` Snowflake 환경 섹션
  - PASS 기준: warehouse 관련 언급 존재
- [ ] **R2.3**: 정적 Marketplace 데이터 사용 명시 (실시간 아님 → 비용 예측 가능)
  - evidence: `specs/moving-simulator-spec.md §8` "데이터 갱신" 행
  - PASS 기준: "별도 갱신 없음" 류의 문구
- [ ] **R2.4**: Forecast 학습 최소 행 수(12행)가 상수로 설정 → 불필요 학습 방지
  - evidence: `app/config.py::FORECAST_MIN_ROWS`
  - PASS 기준: 상수 존재

### R3. 논리적 해결 + 구현 가능성 (5점)

- [ ] **R3.1**: 데모 시나리오 정상 경로가 sis-verifier로 검증된 이력 존재
  - evidence: `state/findings.md`에 F29 참조
  - PASS 기준: F29 문자열 존재
- [ ] **R3.2**: Phase A~G 이력이 findings.md에 29개 이상 기록
  - evidence: `tier1.findings.total >= 29`
  - PASS 기준: 29 이상
- [ ] **R3.3**: 데이터 교차 검증(Phase D.5) 결과가 findings.md에 기록됨 (F21)
  - evidence: `state/findings.md`에 F21 참조
  - PASS 기준: F21 문자열 존재
- [ ] **R3.4**: 위험 완화 — 5분 데모 보호선(핵심 3개 Step) 정책이 문서화
  - evidence: `CLAUDE.md` 또는 `specs/product-harness.md`의 "5분 데모 보호"
  - PASS 기준: 해당 문구 존재

---

## 카테고리 5: 발표 및 스토리텔링 (10점)

### P1. 솔루션이 문제 진술 넘어 혁신/창의적 기능 (3.33)

- [ ] **P1.1**: 발표 스크립트 파일 `specs/presentation-script.md` 존재
  - evidence: `tier3.presentation_script_exists == true`
  - PASS 기준: true
- [ ] **P1.2**: 발표 스크립트에 10분 구조(2+5+2+1)가 섹션 헤더로 명시
  - evidence: `tier3.presentation_raw` — "문제 정의" / "데모" / "기술" / "향후" 헤더 4개
  - PASS 기준: 4개 헤더 모두 존재
- [ ] **P1.3**: 발표 스크립트에 "차별화"/"novelty" 핵심 문장 1개 이상
  - evidence: `tier3.presentation_raw`
  - PASS 기준: "차별화"/"기존과 달리"/"novelty" 키워드 존재
- [ ] **P1.4**: 발표 스크립트에 데모 시나리오 핵심 숫자(4억/영등포/서초)가 인용
  - evidence: `tier3.presentation_raw`
  - PASS 기준: "4억" + "영등포" + "서초" 세 키워드 모두 존재

### P2. 해결 과제 + 향후 전망 명확 (3.33)

- [ ] **P2.1**: 스크립트에 "해결한 문제" 섹션이 명시적 문장으로 존재
  - evidence: `tier3.presentation_raw`
  - PASS 기준: "해결한 문제" or 동등 섹션 헤더
- [ ] **P2.2**: 스크립트에 "향후 계획" 섹션이 2개 이상 bullet
  - evidence: `tier3.presentation_raw`
  - PASS 기준: "향후" 섹션 bullet ≥ 2
- [ ] **P2.3**: 스크립트에 "확장 가능성" 또는 "전국 적용" 문구 존재
  - evidence: `tier3.presentation_raw`
  - PASS 기준: 관련 키워드 존재
- [ ] **P2.4**: 현재 한계 1개 이상 솔직하게 인정 (3개 구 한정 등)
  - evidence: `tier3.presentation_raw`
  - PASS 기준: "3개 구" 또는 "한정" 문구

### P3. 데모 전달력 + Snowflake 핵심 역할 부각 (3.33)

- [ ] **P3.1**: 스크립트에 "Cortex Forecast" 또는 "Cortex LLM" 실명 인용
  - evidence: `tier3.presentation_raw`
  - PASS 기준: "Cortex" 키워드 2회 이상
- [ ] **P3.2**: 스크립트에 "Marketplace" 또는 실제 데이터셋명 인용
  - evidence: `tier3.presentation_raw`
  - PASS 기준: "Marketplace" 또는 "Richgo"/"SPH"/"아정당" 중 2개 이상
- [ ] **P3.3**: 데모 스크립트의 라이브 시연 순서가 명확 (단계별 나열)
  - evidence: `tier3.presentation_raw`
  - PASS 기준: Step1/Step2/Step3 순서 명시
- [ ] **P3.4**: 데모에서 강조할 숫자 1개 이상 스크립트에 표시 (예: 의료비 +156%)
  - evidence: `tier3.presentation_raw`
  - PASS 기준: % 기호 포함 숫자 1개 이상

---

## 카테고리 6: Flagship Bonus — 5년 미래 시뮬레이션 (15점 보너스)

> **rubric v2 추가** (Phase G-5, 2026-04-11). Phase G-4 deep-interview 6라운드 결론을 체크포인트로 인코딩. Approach H: base 100pt는 v1 그대로 유지, Bonus 15pt를 별도 카테고리로 추가. **총점 max = 115**. User Done 기준 = "cycle 1 총점 75 → cycle 3 총점 ≥ 80" = bonus ≥ 5 필요.
>
> **Flagship 정의**: Climax 섹션 (기존 Step1/2/3/AI요약 아래 별도) + Forecast 5년 확장 + 인구이동(REGION_POPULATION_MOVEMENT) 미사용 데이터 활용 + AI 미래 내러티브 생성.

### FB1. Core 3 구현 존재 (3.75)

- [ ] **FB1.1**: `app/queries.py`에 Forecast 5년(60개월) 쿼리 또는 함수 존재
  - evidence: `tier1.code_files["app/queries.py"]` — FORECASTING_PERIODS >= 60 또는 `query_5yr_forecast` / `query_future_forecast` 류 함수
  - PASS 기준: 호출에 FORECASTING_PERIODS >= 60 인자 또는 함수명에 "5yr"/"future"/"long" 포함
- [ ] **FB1.2**: `app/queries.py`에 `REGION_POPULATION_MOVEMENT` 쿼리 존재
  - evidence: 파일 raw text에 테이블명 직접 참조
  - PASS 기준: `REGION_POPULATION_MOVEMENT` 문자열 존재
- [ ] **FB1.3**: `app/queries.py`에 미래 내러티브 생성 함수 존재
  - evidence: 함수명 `generate_future_narrative` 또는 `generate_5yr_story` 또는 동등
  - PASS 기준: 해당 이름의 함수 정의 존재 + LLM 호출 포함

### FB2. Climax UI 렌더 (3.75)

- [ ] **FB2.1**: sis-verifier가 "5년" 또는 "2031" 텍스트를 Climax 영역에서 감지
  - evidence: `tier2.sis` — text-contains "5년" 또는 "2031"
  - PASS 기준: true
- [ ] **FB2.2**: sis-verifier가 인구이동 관련 시각화를 감지 (차트 또는 metric)
  - evidence: `tier2.sis.cp8_population_chart` (신규 필드, collect_evidence v2에 추가)
  - PASS 기준: true
- [ ] **FB2.3**: sis-verifier가 Climax 섹션에 한국어 내러티브(2문장+)를 감지
  - evidence: `tier2.sis.cp9_future_narrative` — "미래"/"5년"/"전망" 키워드 포함
  - PASS 기준: true

### FB3. AI 내러티브 품질 (3.75)

- [ ] **FB3.1**: 생성된 내러티브에 구체 숫자 1개 이상 포함 (시세 예측치 또는 인구 변화)
  - evidence: `tier2.sis.future_narrative_sample` — 숫자 + 단위 매칭
  - PASS 기준: `\d+(만원|%|명|천 명)` 형태 1개 이상
- [ ] **FB3.2**: 내러티브에 "5년" 또는 "미래" 키워드 포함
  - evidence: 동일 sample 필드
  - PASS 기준: "5년" 또는 "미래" 또는 "2031" 문자열
- [ ] **FB3.3**: 내러티브가 조언/권장/예상 행동 유도 단어 포함 (판단 내리는 느낌)
  - evidence: 동일 sample 필드
  - PASS 기준: "권장"/"조언"/"예상"/"전망"/"추천" 중 1개 이상

### FB4. 회귀 방지 + 데모 안정성 (3.75)

- [ ] **FB4.1**: 기존 CP0~CP6 모두 PASS 유지 (Step1/2/3/AI요약 회귀 없음)
  - evidence: `tier2.sis.cp0_errors == 0` + `cp2_step1_rendered == true` + `cp5_forecast_metric == true` + `cp6_ai_summary_present == true`
  - PASS 기준: 4개 모두
- [ ] **FB4.2**: Forecast 5년 모델 호출 성공 (DB 쿼리 결과 존재)
  - evidence: `tier2.db.forecast_5yr_predict_rows > 0` (신규 필드)
  - PASS 기준: > 0
- [ ] **FB4.3**: Climax 섹션 렌더 에러 0
  - evidence: `tier2.sis.cp0_errors == 0` (cp0 errors가 전역이므로 climax 추가 후에도 0이어야 함)
  - PASS 기준: true

---

## 체크포인트 총 개수 확인 (v2)

| 카테고리 | 항목 × 체크포인트 | 합 | 가중치 |
|---------|---------|---|---|
| 창의성 | 3 × 4 | 12 | 25 |
| Snowflake | 3 × 4 | 12 | 25 |
| AI | 3 × 4 | 12 | 25 |
| 현실성 | 3 × 4 | 12 | 15 |
| 발표 | 3 × 4 | 12 | 10 |
| **Base 합계** | | **60** | **100** |
| Flagship Bonus | 4 × 3 | 12 | 15 |
| **Total** | | **72** | **115** |

각 체크포인트 1개당 이론 기여:
- 창의성/Snowflake/AI: 8.33 / 4 = 2.08
- 현실성: 5 / 4 = 1.25
- 발표: 3.33 / 4 = 0.83
- **Flagship Bonus**: 3.75 / 3 = **1.25** (FB1~FB4 각 항목당 3 CP)

## v2 채점 공식

```
base_score = Σ(창의성 + Snowflake + AI + 현실성 + 발표)  [max 100]
bonus_score = Σ(Flagship Bonus)                           [max 15]
total_score = base_score + bonus_score                    [max 115]
```

**User Done 기준** (Phase G-4 Round 6):
- Cycle 1: base 75 / bonus 0 / total 75
- Cycle 3 target: base ≥ 75 / bonus ≥ 5 / **total ≥ 80**

즉 base는 회귀만 없으면 OK, bonus 5점 이상이 flagship 구현 성공 신호.
