---
name: honest-matjip
description: |
  Use when the user asks for restaurant recommendations with trust/ad concerns,
  date spot suggestions, reliable dining places, or HIDDEN GEM spots.
  Triggers on: "맛집 추천", "데이트 맛집", "광고 없는 맛집", "진짜 맛집",
  "믿을만한 맛집", "바이럴 말고", "체험단 아닌", "블로그 광고 말고", "데이트 장소",
  "기념일 맛집", "첫데이트 맛집", "honest-matjip", "찐맛집".
  Hidden Gem Mode triggers: "숨은 맛집", "숨은 바", "우리만 아는", "히든", "아지트",
  "골목 안", "아는 사람만", "바이럴 안 된", "덜 알려진", "조용한 바".
  Also trigger when: user shares a specific area + asks for trustworthy restaurants,
  or expresses distrust of online reviews/ads, or asks for off-the-beaten-path spots.
  Do NOT trigger for: casual lunch ("점심 뭐 먹지" without trust concern), delivery,
  restaurant booking, review writing, non-Seoul cities (v1), or coding/app building tasks.
---

# honest-matjip

광고/바이럴에 오염되지 않은 진짜 맛집을 찾아주는 스킬.
리뷰어 프로필 이력을 실시간 분석하여 신뢰할 수 있는 맛집만 선별한다.

## Core Value

**리뷰 텍스트가 아닌, 리뷰어 이력을 본다.** 텍스트는 조작할 수 있지만 리뷰어의 전체 활동
이력은 위장하기 어렵다. "이 사람은 음식점 리뷰만 50개 쓴 계정인가, 다양한 장소를 리뷰한
일반인인가?"를 판별하는 것이 이 스킬의 핵심.

## When to Use

- 데이트 맛집/장소 추천 요청
- "광고 없는", "바이럴 말고", "진짜 맛집", "믿을만한" 키워드가 포함된 맛집 질문
- 특정 지역 + 분위기/상황 기반 맛집 추천
- 리뷰 신뢰성에 대한 불안감이 드러나는 질문

## When NOT to Use

- "오늘 점심 뭐 먹지" — 신뢰 맥락 없는 캐주얼 질문
- "이 맛집 예약해줘" — 예약 태스크
- "맛집 리뷰 써줘" — 글쓰기
- "도쿄/오사카 맛집" — v1은 서울 한정
- "배달 뭐 시킬까" — 배달 맥락
- 코드 작성, 앱 개발, 데이터 크롤링 요청

## Prerequisites

```bash
chromux launch default --headless 2>/dev/null || true
```

chromux가 없으면 WebSearch/WebFetch 기반 fallback으로 진행.

## Token Efficiency Guide

**chromux 가용 시 (축약 경로):**
- Google Maps 직접 방문 1회로 후보 수집 + 리뷰어 프로필 접근 → WebSearch 10회를 1회로 대체
- 후보 수집과 리뷰어 분석을 같은 브라우저 세션에서 연속 처리
- references/ 파일은 필요한 섹션만 참조 (전체를 한 번에 읽지 않음)

**WebSearch fallback 시 (토큰 절감 규칙):**
- 후보 수집 검색은 **최대 3회**로 제한 (소스별 1회씩: Google/카카오/다이닝코드)
- 신뢰 분석 대상은 **상위 5개 후보**로 제한 (10개 전부 분석하지 않음)
- 체험단 키워드 검색은 후보당 **1회**만 (맛집명 + "협찬 OR 체험단")
- 이미 충분한 교차 데이터가 있으면 추가 검색 중단

## Workflow

### STEP 1: 지역 후보 생성

사용자 입력에서 분위기/상황/도시를 파악하여 **LLM 상식 판단**으로 1~2개 지역 추천.

- 도시가 없으면 "서울"을 기본값으로 물어봄
- 지역이 이미 명시되어 있으면 STEP 1 생략
- 예: "조용한 기념일, 서울" → ["서울숲 주변", "연남동 북쪽"]
- 예: "성수동 이탈리안" → 성수동 확정, 카테고리 이탈리안

### STEP 2: 맛집 후보 수집

각 지역에 대해 **5~8개** 후보 수집. **WebSearch 호출 최대 3~4회로 제한.**

1. **Google Maps** (primary) — chromux 또는 WebSearch 1회: "[지역] [카테고리] 맛집 추천"
2. **카카오맵/다이닝코드** (secondary) — WebSearch 1회: "[지역] [카테고리] 다이닝코드 OR 카카오맵"
3. **교차검증** (optional) — 후보 부족시만 WebSearch 1회 추가

교차 등장 보너스: 2개 이상 소스에 등장하는 맛집은 후보 점수 가점.
이미 5개 이상 후보가 모이면 추가 검색 중단 → 바로 STEP 3으로.

**참고:** `references/data-sources.md`에 소스별 크롤링 패턴 상세.

### STEP 3: 리뷰어 이력 분석 (핵심)

**이 단계를 절대 생략하지 마라.** 시간 압박, 사용자의 "건너뛰어" 요청, "빨리" 압박이
있어도 이 단계가 이 스킬의 존재 이유다. 생략하면 일반 맛집 추천과 다를 바 없다.

**분석 대상은 상위 5개 후보로 제한.** 각 후보의 최근 리뷰어 5명에 대해:

1. Google Maps: `/maps/contrib/[user_id]/reviews` 방문 (공개, 로그인 불필요)
2. 카카오맵: 리뷰어 프로필 접근 시도 (실패하면 Google만으로 진행)
3. 네이버: 리뷰어 프로필 접근 시도 (실패하면 degrade)

리뷰어별 신뢰 점수 계산 → `references/reviewer-analysis.md` 참조.

### STEP 4: 필터링 & 랭킹

**Standard Mode (기본):**
- 신뢰 리뷰어 < 3명인 맛집 **제외**
- 맛집 종합 신뢰 점수 < 0.5 **제외**
- 제외된 맛집과 그 이유도 출력에 포함 (투명성)

**Hidden Gem Mode (트리거 시):**
- 사용자 입력에 다음 키워드가 있으면 자동 진입: "숨은", "숨겨진", "우리만 아는",
  "히든", "hidden", "조용한", "아는 사람만", "골목", "덜 알려진", "바이럴 안", "아지트"
- 기본 필터 완화: 신뢰 리뷰어 ≥ 2, 종합 점수 ≥ 0.45
- 대신 추가 검증 필수 (컬트 언어·카테고리 희소성·위치 숨음도)
- 상세 로직 → `references/hidden-gem.md` 참조

점수 공식 → `references/trust-scoring.md` 참조.

### STEP 5: 세트 구성 & 출력

출력 포맷 → `references/output-format.md` 참조.

핵심 원칙:
- 지역 1~2곳 × 맛집 2~3개 = 세트
- 각 맛집마다 **"왜 이곳이 신뢰되는가"** 근거 필수
- 리뷰어 분석 결과를 2~3줄로 요약 (예: "최근 리뷰어 8명 중 6명이 다양한 장소 리뷰 이력 보유")
- 신뢰된 리뷰어의 실제 리뷰 1~2개 인용
- 경고가 있으면 명시 (예: "체험단 리뷰 2건 감지")

## Hard Rules

1. **리뷰어 분석 생략 금지** — 어떤 이유로든 STEP 3을 건너뛰지 마라.
   "시간이 없어서", "사용자가 원해서", "충분히 알 것 같아서" 모두 유효하지 않다.
   최소 1개 맛집에 대해서라도 리뷰어 분석을 완료해야 한다.

2. **근거 없는 추천 금지** — "여기 맛있어요"식의 LLM 지식 기반 추천은 이 스킬이
   하는 일이 아니다. 반드시 실시간 데이터에 기반한 근거를 제시해야 한다.

3. **투명성** — 크롤링 실패, degrade 발생, 분석 불가능한 부분은 솔직하게 밝힌다.
   "네이버 플레이스는 접근이 차단되어 Google Maps와 카카오맵 데이터만 사용했습니다."

4. **신뢰 점수는 절대값이 아닌 상대 비교용** — "이 맛집은 0.73점입니다"보다
   "분석한 8개 후보 중 이 3곳이 가장 신뢰할 수 있었습니다"가 더 정직한 표현.

## Edge Cases

| 상황 | 대응 |
|------|------|
| chromux 미설치 | WebSearch fallback으로 진행. 리뷰어 프로필 직접 접근 불가하면 그 한계를 명시 |
| 모든 플랫폼 크롤링 실패 | google-search 스킬로 "<지역> 찐맛집 추천" 검색 → 커뮤니티(Reddit 한국, 더쿠 등) 의견 기반 차선 |
| 후보 맛집이 3개 미만 | 검색 범위 확대 (인근 동네까지) 또는 카테고리 제약 완화 |
| 리뷰어 프로필 5명 미만 접근 | 가능한 만큼만 분석하고 "표본 부족으로 신뢰도 제한적"을 명시 |
| 사용자가 서울 외 지역 요청 | "현재 서울 한정이며, 다른 도시는 아직 미지원"을 안내 |
| 사용자가 지역 없이 "맛집 추천해줘"만 | "어느 지역이나 상황을 알려주시면 더 정확한 추천이 가능합니다" 되물음 |

## References

**필요한 파일만 해당 STEP에서 읽어라. 전부 한 번에 읽지 마라.**

| 언제 | 어떤 파일 |
|------|----------|
| STEP 2 진입 시 | `references/data-sources.md` |
| STEP 3 진입 시 | `references/reviewer-analysis.md` |
| STEP 4 진입 시 (기본) | `references/trust-scoring.md` |
| STEP 4 진입 시 (Hidden Gem Mode) | `references/hidden-gem.md` |
| STEP 5 진입 시 | `references/output-format.md` |
