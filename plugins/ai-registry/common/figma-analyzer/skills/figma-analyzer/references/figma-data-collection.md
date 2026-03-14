# Figma 데이터 수집 가이드

## MCP 도구 우선순위

1. **`get_screenshot(fileKey, nodeId)`** — Visual context FIRST. 메타데이터가 placeholder일 때 가장 풍부한 정보원
2. **`get_metadata(fileKey, nodeId)`** — 페이지/프레임/레이어 구조. 디자이너의 mental model 파악
3. **`get_design_context(fileKey, nodeId)`** — instance 컴포넌트 내부 텍스트 읽기에 필수
4. **`get_variable_defs(fileKey)`** — 디자인 토큰/변수 정의

## Figma URL 파싱

- `figma.com/design/{fileKey}/...?node-id={nodeId}`
- `nodeId` 형식: URL의 `1-2` → API 호출 시 `1:2`

## 읽기 전략

- 공유된 node의 screenshot으로 시각 컨텍스트 확보
- metadata로 구조 파악
- instance 컴포넌트가 있는 프레임은 get_design_context 사용
- 페이지별 순서대로 작업 (랜덤 X)

## MCP API Rate Limits

| 플랜 | 한도 |
|------|------|
| Starter | 6/월 |
| Pro/Org | 200/일 |
| Enterprise | 600/일 |

**한도 부족 시 우선순위:** screenshot (전체 프레임) > get_design_context (핵심 프레임) > metadata

Rate limit 도달 시 **즉시 수동 스크린샷 대안 경로를 안내**하고 확보된 데이터로 분석 계속.

## Placeholder 텍스트 감지

메타데이터 텍스트가 반복 placeholder("ABCDE", "Lorem ipsum", "텍스트", "내용")이면 screenshot이 PRIMARY 소스. Placeholder에서 의미를 추출하지 말 것.

## Instance 컴포넌트

메타데이터에 `<instance>`로 표시되는 재사용 컴포넌트는 내부 텍스트가 숨겨짐. 테이블 컬럼 헤더 등을 읽으려면 `get_design_context` 필요. API 호출 제한 시 gap으로 명시.

---

## 수동 스크린샷 대안 경로

MCP 호출이 제한되거나 MCP 도구 자체를 사용할 수 없을 때, **수동 스크린샷으로 동일한 분석 품질을 달성할 수 있다.**

### 사용 시점

- MCP rate limit에 도달했을 때
- Figma MCP 서버가 설정되어 있지 않을 때
- 유저가 이미 스크린샷을 가지고 있을 때

### 유저 안내 메시지

```
Figma MCP API 호출 한도에 도달했습니다.
대안으로, Figma에서 직접 스크린샷을 내보내서 공유해주시면 동일하게 분석 가능합니다.

방법:
1. Figma에서 분석할 프레임 선택
2. 우클릭 → "Copy/Paste as" → "Copy as PNG" 또는
   우측 패널 하단 "Export" → PNG 2x로 내보내기
3. 내보낸 파일 경로를 알려주세요 (예: ~/Desktop/screen1.png)
```

### 스크린샷 품질 확인 (분석 시작 전)

스크린샷을 Read한 후 다음을 확인하고, 문제가 있으면 분석 전에 재촬영 요청:
- **텍스트 가독성:** 주요 레이블이 읽히는가? → "PNG 2x로 다시 내보내주세요"
- **화면 완전성:** 스크롤/잘림이 있는가? → "전체 페이지 캡처를 부탁드립니다"
- **상태 다양성:** 같은 상태만 보이는가? → 데이터가 있는 상태 캡처 요청

### 진행 불가 기준 (STOP & ASK)

다음 중 하나라도 해당되면, **추정으로 밀어붙이지 말고** 반드시 유저에게 재촬영 또는 추가 정보를 요청:
- 제품명/로고/타이틀을 읽을 수 없어 **어떤 제품인지 식별이 불가능**한 경우
- 주요 네비게이션 메뉴의 텍스트가 판독 불가능한 경우
- 화면의 핵심 데이터(테이블 컬럼 헤더, 폼 필드 레이블 등)가 대부분 읽히지 않는 경우
- **"읽을 수 없는데 추정은 가능하다"는 함정에 빠지지 말 것** — 추정으로 쌓은 분석은 도메인 오인식 시 전체가 무효화됨

### 분석 방법

- Read tool로 이미지 파일을 읽어 시각적으로 분석 (PNG, JPG 지원)
- 여러 스크린샷은 병렬 Read로 전체 구조 파악
- 읽을 수 있는 정보: 텍스트, 레이아웃, 컴포넌트 패턴, 상태값, 네비게이션

### 장점과 한계

**장점:** MCP 호출 0회, 선택적 프레임 제공, 고해상도(2x) export로 가독성 향상

**한계 (명시적으로 flag):**
- 파일 전체 구조 자동 파악 불가 → 유저에게 구조 설명 요청
- 프로토타입 플로우 연결 정보 없음 → 화면 간 관계 확인 필요
- 디자인 토큰/변수 정보 없음 → 시각적 추론

### 신뢰도 마커 분포 변화

수동 스크린샷 경로에서는:
- [확인]: 스크린샷에서 직접 읽을 수 있는 텍스트, 레이아웃, 상태값에 한정
- [추론]: 화면 간 관계, 네비게이션 흐름 등 추론 비중 증가
- [추정]: 파일 전체 구조, 미제공 화면, 프로토타입 플로우 → 모두 [추정]으로 격상
- "Analysis Scope & Limitations" 섹션에 반드시 포함: "본 분석은 N개의 수동 스크린샷을 기반으로 수행되었으며, Figma 파일 구조 및 프로토타입 플로우 정보 없이 진행되었습니다."

**혼합 사용 권장:** MCP로 metadata 1회 호출 + 나머지는 수동 스크린샷이 가장 효율적.

### 대규모/부분 파일 분석

**Large files (5+ pages):** Phase 1 Orient 후 유저에게 우선 분석 영역을 질문. 우선 영역은 full depth, 나머지는 lighter level로 요약.

**Partial file analysis:** 특정 node만 제공되었거나 API 제한으로 전체 분석 불가 시:
- 확보된 데이터를 full depth로 분석
- node의 이름, 콘텐츠, 구조에서 전체 제품 내 역할 추론
- 분석 범위 vs 미확인 범위를 명시
- "Analysis Scope & Limitations" 섹션 포함
