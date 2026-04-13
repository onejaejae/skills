---
name: visual-verdict
description: |
  스크린샷 vs 레퍼런스 이미지 비교를 통한 시각적 QA 판정 스킬.
  디자인 시안(Figma export 등)과 실제 구현 스크린샷을 비교하여
  score/verdict/differences/suggestions를 구조화된 JSON으로 반환한다.
  Ralph 루프와 통합하여 90+ 점수까지 반복 개선할 수 있다.
  Use when: "/visual-verdict", "비주얼 체크", "디자인 비교", "스크린샷 비교",
  "visual check", "visual QA", "디자인이랑 비교해줘", "구현 확인",
  "이거 디자인대로야?", "화면 비교", "UI 검증", "design diff".
  Also use PROACTIVELY after writing HTML/CSS/frontend code when a reference
  design image exists in the project.
allowed-tools:
  - Read
  - Bash
  - Glob
  - Write
---

# /visual-verdict — 시각적 QA 판정 루프

레퍼런스 이미지(디자인 시안)와 현재 구현 스크린샷을 비교하여
구조화된 판정을 내린다. Ralph 루프 안에서 매 iteration마다 실행하여
시각적 품질이 목표 점수에 도달할 때까지 반복한다.

## Why This Exists

코드만 봐서는 UI가 디자인대로 구현됐는지 알 수 없다. 이 스킬은 Claude의
멀티모달 능력을 활용하여 두 이미지를 직접 비교하고, 차이점을 구조화된
피드백으로 변환한다. "눈으로 확인" 단계를 자동화하는 것이다.

## When to Use

| 상황 | 사용? |
|------|------|
| 디자인 시안이 있고 구현 스크린샷이 있음 | YES |
| Ralph 루프 안에서 visual iteration | YES |
| HTML/CSS 작성 후 디자인 대조 | YES |
| 백엔드 API 코드 리뷰 | No — /pr-reviewer 사용 |
| 디자인 시안 분석 (구현 없이) | No — /figma-analyzer 사용 |

## Input

두 가지 이미지가 필요하다:

| 이미지 | 설명 | 형식 |
|--------|------|------|
| **Reference** | 디자인 시안 (목표 상태) | PNG/JPG 파일 경로 또는 Figma export |
| **Current** | 현재 구현 스크린샷 | PNG/JPG 파일 경로 또는 브라우저 캡처 |

### 입력 파싱

```
/visual-verdict <reference_path> <current_path>
/visual-verdict --ref design.png --current screenshot.png
/visual-verdict  (인자 없으면 프로젝트에서 자동 탐색)
```

**자동 탐색 모드** (인자 없을 때):
1. `.dev/designs/` 또는 `designs/` 또는 `assets/` 에서 레퍼런스 이미지 검색
2. `.dev/screenshots/` 또는 `/tmp/` 에서 최근 스크린샷 검색
3. 매칭되는 쌍이 있으면 사용, 없으면 사용자에게 경로 질문

## Protocol

### Step 1: 이미지 로드 및 비교

두 이미지를 Read tool로 읽는다 (Claude는 이미지를 직접 볼 수 있다).

비교 관점 (5개 축):
1. **Layout**: 요소 배치, 간격, 정렬
2. **Typography**: 폰트 크기, 굵기, 색상, 행간
3. **Colors**: 배경색, 텍스트 색, 브랜드 컬러 일치
4. **Components**: 버튼, 입력 필드, 카드 등 UI 컴포넌트 형태
5. **Content**: 텍스트 내용, 아이콘, 이미지 일치

### Step 2: 점수 산출

각 축별 점수 (0-20, 총합 100):

| 축 | 가중치 | 채점 기준 |
|---|--------|----------|
| Layout | 20점 | 요소 위치/크기가 레퍼런스와 일치 |
| Typography | 20점 | 폰트 스타일이 레퍼런스와 일치 |
| Colors | 20점 | 색상 팔레트가 레퍼런스와 일치 |
| Components | 20점 | UI 컴포넌트 형태/상태가 일치 |
| Content | 20점 | 텍스트/아이콘/이미지 내용 일치 |

### Step 3: Verdict 판정

| Score | Verdict | 의미 |
|-------|---------|------|
| 90-100 | **PASS** | 디자인과 충분히 일치. 반복 종료 가능. |
| 70-89 | **ITERATE** | 대부분 일치하지만 개선 필요. 다음 iteration 진행. |
| 50-69 | **MAJOR_DIFF** | 상당한 차이. 여러 항목 수정 필요. |
| 0-49 | **REDESIGN** | 근본적 차이. 접근 방식 재검토 필요. |

### Step 4: 구조화된 출력

```json
{
  "score": 75,
  "verdict": "ITERATE",
  "breakdown": {
    "layout": { "score": 18, "max": 20, "notes": "헤더 높이 4px 차이" },
    "typography": { "score": 15, "max": 20, "notes": "본문 폰트 크기 14px → 16px 필요" },
    "colors": { "score": 20, "max": 20, "notes": "일치" },
    "components": { "score": 12, "max": 20, "notes": "버튼 border-radius 불일치" },
    "content": { "score": 10, "max": 20, "notes": "placeholder 텍스트 누락" }
  },
  "differences": [
    {
      "location": "헤더 영역",
      "expected": "높이 64px, 로고 좌측 정렬",
      "actual": "높이 60px, 로고 중앙 정렬",
      "severity": "minor",
      "fix_hint": "header { height: 64px; } .logo { text-align: left; }"
    }
  ],
  "suggestions": [
    "본문 폰트 크기를 16px로 변경",
    "CTA 버튼에 border-radius: 8px 적용",
    "입력 필드에 placeholder 텍스트 추가"
  ],
  "iteration": 1,
  "reference_path": "designs/main-page.png",
  "current_path": "screenshots/current.png"
}
```

### Step 5: 피드백 파일 저장

결과를 `.dev/visual-verdicts/` 에 저장하여 iteration 히스토리를 추적한다:

```bash
mkdir -p .dev/visual-verdicts
```

파일명: `{component}-verdict-{iteration}.json`

### Step 6: Ralph 루프 연동 (선택)

Ralph 루프 안에서 사용할 때:
1. 매 iteration 후 `/visual-verdict` 실행
2. Score ≥ 90 → PASS → Ralph 루프 DoD 충족
3. Score < 90 → `suggestions` 기반으로 코드 수정 → 재스크린샷 → 재판정

**Ralph 통합 출력:**
```
Visual Verdict: ITERATE (75/100)
- Layout: 18/20
- Typography: 15/20 ← 본문 폰트 크기 수정 필요
- Colors: 20/20 ✓
- Components: 12/20 ← 버튼 border-radius 불일치
- Content: 10/20 ← placeholder 누락

다음 iteration에서 수정할 항목:
1. font-size: 14px → 16px (Typography +5)
2. border-radius: 4px → 8px (Components +4)
3. placeholder 텍스트 추가 (Content +6)
예상 점수: 90/100 → PASS 가능
```

---

## 마크다운 출력 (대화용)

JSON 출력과 함께, 사용자에게는 읽기 쉬운 마크다운으로도 결과를 보여준다:

```markdown
## Visual Verdict: {verdict} ({score}/100)

### 점수 상세

| 축 | 점수 | 비고 |
|----|------|------|
| Layout | 18/20 | 헤더 높이 4px 차이 |
| Typography | 15/20 | 본문 폰트 크기 불일치 |
| Colors | 20/20 | 일치 |
| Components | 12/20 | 버튼 border-radius 불일치 |
| Content | 10/20 | placeholder 텍스트 누락 |

### 차이점
1. **헤더 영역**: 높이 64px → 60px, 로고 정렬 불일치
2. ...

### 수정 제안
1. `font-size: 16px` 적용
2. `border-radius: 8px` 적용
3. placeholder 텍스트 추가
```

---

## Checklist Before Stopping

- [ ] 두 이미지 모두 Read로 로드하여 비교했는가
- [ ] 5개 축 모두 점수를 매겼는가 (Layout/Typography/Colors/Components/Content)
- [ ] 총점과 verdict를 정확히 산출했는가
- [ ] differences 배열에 구체적 차이점을 기록했는가
- [ ] suggestions 배열에 수정 제안을 기록했는가 (fix_hint 포함)
- [ ] JSON 출력을 `.dev/visual-verdicts/` 에 저장했는가
- [ ] 마크다운 출력도 사용자에게 보여줬는가
