# sis-verifier protocol reference

체크포인트(CP) 정의와 검증 방법. SKILL.md에 포함하기엔 자세한 내용을 여기에 둔다.

## 체크포인트 정의

각 CP는 "통과 조건"과 "실패 조건"을 명확히 한다.

### CP0 — 앱 로드

| 항목 | 통과 | 실패 |
|---|---|---|
| HTTP 응답 | chromux open이 200/title 반환 | 4xx/5xx 또는 빈 페이지 |
| 페이지 타이틀 | 예상 substring 포함 | 다른 타이틀 또는 "Snowflake"만 |
| iframe 발견 | `cdp_helper.py find` 가 성공 (`found: true`) | `found: false` (15초 추가 대기 후 재시도, 그래도 실패면 FAIL) |

### CP1 — 입력 폼 + 에러 0개

| 항목 | 통과 | 실패 |
|---|---|---|
| 입력 요소 존재 | `cdp_helper.py query "input, select, [role='combobox'], [role='slider']"` 가 카운트 >= 예상값 | 0개 |
| 메인 액션 버튼 존재 | `cdp_helper.py buttons` 결과에 예상 텍스트 substring 매칭 | 매칭 없음 |
| 에러 배너 0개 | `cdp_helper.py errors` exit code 0 | 카운트 >= 1 |
| 시각 확인 | 스크린샷에 빨간 에러 영역 없음 | 빨간 알림 띠 보임 |

### CP2 — 메인 액션 클릭

| 항목 | 통과 | 실패 |
|---|---|---|
| dispatch | `cdp_helper.py click <x> <y>` 결과 OK | 예외 |
| UI 반응 | 1초 내 "Running..." 또는 spinner 표시 / 결과 영역 추가 | 변화 없음 (좌표 빗나감 → inspect로 재측정) |

### CP3~CP5 — 결과 영역 단계별

각 단계는:
1. 적절한 scrollTop으로 스크롤 (`cdp_helper.py scroll <px>`)
2. 처리 시간 대기 (LLM/Forecast: ~30s, 단순 SQL: ~3s)
3. screenshot
4. DOM 검증 (예상 텍스트 또는 element 존재)

### CP6 — LLM/외부 호출 결과

| 항목 | 통과 | 실패 |
|---|---|---|
| 결과 텍스트 | `cdp_helper.py text-contains "<예상 substring>"` exit code 0 | 1 (없음) |
| 한국어 검증 (해당 시) | 한국어 substring 매칭 | 영어 응답만 있음 |
| 길이 sanity | 텍스트 길이 30자 이상 | 너무 짧음 (LLM 실패 가능성) |

### CP7 — 보조 입력칸 (Mini-Agent 등)

| 항목 | 통과 | 실패 |
|---|---|---|
| 렌더 | 입력 element 존재 + placeholder 정확 | 없음 |
| 간단 쿼리 (선택) | 입력 + 클릭 + 결과 검증 | 처리 안 됨 |

## 데모 시나리오 예시 (이사 결정 AI 시뮬레이터)

```
시나리오 ID: moving-sim-default
입력값:
  - 현재 거주 구: 영등포구
  - 가족 수: 2
  - 예산 유형: 전세
  - 예산: 40000 (4억)
액션:
  - "🔍 추천받기" 버튼 클릭
검증:
  CP3: Step1 결과 — section "Step 1: 추천 단지" + 단지 드롭다운 + 지도
  CP4: 첫 단지 선택 (또는 default)
  CP5a: Step2 — section "Step 2: 소비 시뮬레이션" + 8개 카테고리 바차트
  CP5b: Step3 — section "Step 3: 시세 예측" + 시세 라인차트
  CP6: AI 요약 — section "AI 분석 요약" + 한국어 텍스트 30자+
  CP7: Mini-Agent — section "더 궁금한 점이 있나요?" + 입력칸
스크롤 위치 가이드:
  scrollTop=0     : 입력 폼
  scrollTop=800   : Step1 지도 + 드롭다운
  scrollTop=1300  : Step2 바차트 + Step3 시작
  scrollTop=1700  : Step3 시세 차트
  scrollTop=2400  : AI 요약 + Mini-Agent
```

## 자율성 정책

- **즉시 수정 (시도 카운트 안 함)**: 좌표 빗나감 → inspect로 재측정 후 재클릭
- **1~2회 자체 수정**: 결과 영역 텍스트가 예상과 약간 다름 → DOM 재검증, scroll 재조정
- **즉시 사용자 보고**: 인증 만료 (Snowflake 재로그인 필요), 네트워크 에러, 앱 자체가 deploy 안 됨, 5분 이상 "Running..." 멈춤

## 호출 전 체크리스트

이 스킬을 호출하기 전에 다음을 확인:

- [ ] `chromux ps` 또는 `chromux launch default` 로 daemon 동작 중
- [ ] `python3 -c "import websocket"` 성공 (없으면 `pip3 install --user websocket-client`)
- [ ] 검증할 SiS 앱 URL이 명확
- [ ] 데모 시나리오의 입력값/예상 결과가 명확
- [ ] Snowflake 로그인 상태 유효 (chromux profile에)
