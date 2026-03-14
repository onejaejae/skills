---
name: explaining-code
description: Use when 코드 동작 원리 설명, "이게 어떻게 동작해?", "이 코드 설명해줘", "왜 이렇게 작성했어?" 질문에 응답. 코드베이스 이해, 멘토링, 온보딩, 코드 리뷰 맥락 설명 시 사용.
---

# 코드 설명하기

## Overview

코드 설명의 목표: **상대방이 새로운 입력에 대해 출력을 예측할 수 있게** 만드는 것.

3가지 원칙:
1. **구체적 데이터로 추상을 깨라** — 실제 값으로 트레이스해야 이해된다
2. **전체에서 부분으로 내려가라** — 조감도 먼저, 디테일은 나중에
3. **"왜 이 방식인가"를 답하라** — 코드가 아닌 의도를 설명한다

## When to Use

- "이 코드 설명해줘", "이게 어떻게 동작해?"
- "왜 이렇게 작성했어?", "이 설계 의도가 뭐야?"
- 온보딩, 멘토링, 코드 리뷰 맥락 설명
- NOT: API 레퍼런스 문서 작성, 디버깅 (→ systematic-debugging)

## 설명 전 두 가지를 먼저 판단한다

**1) 질문 유형 → 집중할 기법 결정**

| 질문 유형 | 상대방의 의도 | 집중할 기법 |
|---|---|---|
| "이게 뭐야?" | **기능** 파악 | 한 문장 요약 + 비유 |
| "어떻게 동작해?" | **메커니즘** 이해 | 다이어그램 + 데이터 트레이스 |
| "왜 이렇게 했어?" | **설계 의도** | Why-Not + 트레이드오프 |

모호하면 물어본다: "전체 흐름이 궁금한 거야, 아니면 특정 부분이 왜 이렇게 된 건지?"

**2) 대상 복잡도 → 설명 깊이 결정**

파일 1개 이하 → Quick / 파일 2-3개 또는 클래스 간 협력 → Standard / 파일 4개+ 또는 여러 서비스 → Deep Dive

### Quick (함수/단일 로직)

1. **한 문장 요약**
2. **예시 데이터 트레이스**
3. **주의점**

### Standard (클래스/모듈)

1. **한 문장 요약** + 비유
2. **구조 다이어그램**
3. **Phase별 책임** (테이블)
4. **예시 데이터 트레이스**
5. **주의점** + Why-Not

### Deep Dive (시스템/파이프라인)

1. **한 문장 요약** + 비유
2. **전체 파이프라인 조감도**
3. **Phase별 책임과 역할** (테이블)
4. **시퀀스 다이어그램** (컴포넌트 간 통신)
5. **예시 데이터 End-to-End 트레이스**
6. **Before/After 상태 비교**
7. **주의점** + Why-Not + 설계 결정

## 설명 기법 레퍼런스

### 한 문장 요약

모든 설명은 이것으로 시작한다:

> "[이 코드]는 [무엇]을 받아서 [어떤 처리]를 하여 [결과/가치]를 만든다."

```
예: "이 미들웨어는 모든 HTTP 요청을 받아서 JWT 토큰을 검증하여,
    인증된 사용자 정보를 req.user에 주입한다."
```

### 비유 (Analogy)

코드 개념을 일상적인 것에 매핑한다. **반드시 비유가 깨지는 지점을 명시한다.**

```
좋은 비유:
  "Event Loop은 카페 바리스타와 같다.
   주문(요청)을 받고, 음료 제조(I/O)는 다른 직원에게 맡기고,
   다음 주문을 받는다. 음료가 완성되면 호출한다.
   ⚠️ 비유의 한계: 실제 Event Loop은 바리스타와 달리
   한 번에 하나의 콜백만 실행한다 (싱글 스레드)."

나쁜 비유:
  "Event Loop은 반복문 같은 거예요." (구조적 유사성 없음)
```

좋은 비유의 조건: **구조적 유사성**이 있어야 한다 (표면적 유사성 X).

### 다이어그램

상황에 맞는 유형을 선택한다:

| 상황 | 다이어그램 유형 |
|---|---|
| 데이터가 A→B→C 흐름 | **흐름도** — 파이프라인, 요청 처리 |
| 컴포넌트 계층/포함 관계 | **구조도** — 아키텍처, 레이어 |
| 여러 주체가 메시지 교환 | **시퀀스** — API 호출, 이벤트 |
| 상태가 전이됨 | **상태도** — 상태 머신, 라이프사이클 |

```
흐름도:  [Request] → [Auth] → [Validate] → [Process] → [Response]
                       ↓ 실패
                   [401 Error]

시퀀스:  Client    Server    DB
           │──req──→ │        │
           │         │──query→│
           │         │←─data──│
           │←─res────│        │
```

구조도(`┌├┤└`)와 상태도(`[State] ──event──→ [State]`)도 동일한 ASCII 패턴으로 그린다.

### Phase별 책임 (Responsibility Table)

파이프라인/시스템의 각 단계를 테이블로 정리한다:

| Phase | 입력 | 출력 | 책임 |
|---|---|---|---|
| 단계명 | 이 단계가 받는 것 | 이 단계가 내보내는 것 | 한 마디로 역할 |

**검증법**: "이 단계가 없으면 무엇이 깨지는가?"로 책임을 확인한다.

### 예시 데이터 트레이스 (Data Trace)

**구체적 입력값으로 코드를 따라가며 각 단계의 데이터 변화를 보여준다.**
추상적 설명보다 한 번의 트레이스가 더 명확하다.

**파이프라인형** — 데이터가 단계를 거쳐 변환될 때:

```javascript
function getAdultNames(users) {
  return users
    .filter(u => u.age >= 18)
    .map(u => u.name.toUpperCase());
}
```

```
입력: [{ name: "Alice", age: 30 }, { name: "Bob", age: 15 }, { name: "Charlie", age: 25 }]

Step 1 - filter(age >= 18):
  Alice(30)   → ✅ 통과
  Bob(15)     → ❌ 제거
  Charlie(25) → ✅ 통과
  결과: [{ name: "Alice", age: 30 }, { name: "Charlie", age: 25 }]

Step 2 - map(name.toUpperCase):
  "Alice" → "ALICE"
  "Charlie" → "CHARLIE"

최종 출력: ["ALICE", "CHARLIE"]
```

**루프/재귀형 (Trace Table)** — 변수가 반복적으로 갱신될 때:

```javascript
function fibonacci(n) {
  let a = 0, b = 1;
  for (let i = 0; i < n; i++) {
    [a, b] = [b, a + b];
  }
  return a;
}
```

| Step | i | a | b | 설명 |
|---|---|---|---|---|
| 초기 | - | 0 | 1 | 초기값 설정 |
| i=0 | 0 | 1 | 1 | a←1(=b), b←0+1(=a+b) |
| i=1 | 1 | 1 | 2 | a←1(=b), b←1+1(=a+b) |
| i=2 | 2 | 2 | 3 | a←2(=b), b←1+2(=a+b) |
| i=3 | 3 | 3 | 5 | a←3(=b), b←2+3(=a+b) |
| 반환 | - | **3** | - | fibonacci(4) = 3 |

### Before/After 상태 비교

상태 변경이 있는 코드(DB, 상태 관리, DOM)에 사용한다:

```
[실행 전 - DB]                    [실행 후 - DB]
┌──────────────────────┐          ┌──────────────────────┐
│ users                │          │ users                │
├────┬───────┬─────────┤          ├────┬───────┬─────────┤
│ id │ name  │ status  │          │ id │ name  │ status  │
│  1 │ Alice │ active  │    →     │  1 │ Alice │ active  │
│  2 │ Bob   │ active  │          │  2 │ Bob   │ deleted │ ← 변경
│  3 │ Carol │ pending │          │  3 │ Carol │ pending │
└────┴───────┴─────────┘          └────┴───────┴─────────┘

변경: Bob의 status active → deleted (1건만 영향)
```

### Why-Not 설명 (Counterfactual)

"왜 다른 방식은 안 되는가"를 설명하여 설계 의도를 전달한다:

```
Q: "왜 여기서 Map을 쓰고 일반 객체를 안 쓴 거야?"

A: 일반 객체는 키가 항상 문자열로 변환된다:
   obj[1] = "a";  obj["1"] = "b";  // obj[1]이 "b"로 덮임

   Map은 키의 타입을 보존한다:
   map.set(1, "a");  map.set("1", "b");  // 둘 다 별도 유지

   이 코드에서는 숫자 ID와 문자열 코드를 모두 키로 쓰므로
   타입 충돌을 방지하려면 Map이 필요하다.
   트레이드오프: JSON 직렬화 시 변환이 필요하다.
```

**패턴**: 대안 코드 → 구체적 문제 상황 → 현재 코드 → 장점 → 트레이드오프

## 적용 예시: Deep Dive

**질문**: "이 인증 미들웨어 파이프라인이 어떻게 동작해?"

**판단**: 질문이 "어떻게"이므로 → 메커니즘 설명에 집중. 파일 3개 이상 → Deep Dive.

**1. 한 문장 요약**
> 이 파이프라인은 HTTP 요청을 받아 토큰 추출 → 검증 → 권한 확인을 거쳐,
> 인증된 사용자 정보가 담긴 요청을 컨트롤러에 전달한다.

**2. 비유**
> 공항 보안 시스템과 같다: 신분증 확인(토큰 추출) → 보안 검색(검증) → 탑승권 확인(권한).
> ⚠️ 한계: 공항과 달리 이 파이프라인은 순서가 바뀌면 동작하지 않는다.

**3. 파이프라인 조감도**
```
[Request] → [extractToken] → [verifyJWT] → [checkPermission] → [Controller]
                 ↓ 없음          ↓ 만료         ↓ 권한 없음
              [401]           [401]          [403]
```

**4. Phase별 책임**

| Phase | 입력 | 출력 | 실패 시 |
|---|---|---|---|
| extractToken | Authorization 헤더 | token 문자열 | 401 Unauthorized |
| verifyJWT | token 문자열 | decoded payload | 401 Token Expired |
| checkPermission | payload.role | req.user 주입 | 403 Forbidden |

**5. 예시 데이터 트레이스**
```
입력: { headers: { authorization: "Bearer eyJhbG..." } }

Step 1 - extractToken:
  "Bearer eyJhbG..." → split(" ") → ["Bearer", "eyJhbG..."] → "eyJhbG..."

Step 2 - verifyJWT:
  "eyJhbG..." → jwt.verify(secret) → { userId: 42, role: "admin", exp: 1735689600 }

Step 3 - checkPermission (required: "admin"):
  payload.role = "admin" → "admin" 포함 → ✅ 통과
  req.user = { userId: 42, role: "admin" }

→ Controller에 req.user가 주입된 상태로 전달
```

**6. Before/After** (이 예시에서는 stateless 미들웨어이므로 req 객체 변화만 비교)
```
Before: req = { headers: { authorization: "Bearer eyJ..." }, user: undefined }
After:  req = { headers: { authorization: "Bearer eyJ..." }, user: { userId: 42, role: "admin" } }
```

**7. Why-Not + 설계 결정**
> Q: "왜 미들웨어 3개로 나눴어? 하나로 합치면 안 돼?"
> A: 하나로 합치면 `extractToken`만 재사용하거나 `checkPermission`만 건너뛰는 게 불가능하다.
> 예: 공개 API는 extractToken + verifyJWT만, 관리자 API는 3개 모두 사용.
> 트레이드오프: 미들웨어 체이닝 순서를 잘못 배치하면 디버깅이 어렵다.

## 적용 예시: Standard

**질문**: "이 CachedFetcher가 어떻게 동작해?"

**판단**: "어떻게" → 메커니즘. 클래스 + 외부 의존성(cache, fetcher) 협력 → Standard.

**1. 한 문장 요약 + 비유**
> 이 클래스는 데이터 요청을 받아 캐시를 먼저 확인하고, 없거나 만료됐으면 원본을 가져와 캐시에 저장한 뒤 반환한다.
> 비유: 냉장고(캐시)에 반찬이 있으면 바로 꺼내고, 없으면 요리(fetch)해서 냉장고에 넣어둔다.
> ⚠️ 한계: 냉장고와 달리 캐시는 TTL이 지나면 자동으로 "상한 것"으로 취급한다.

**2. 구조 다이어그램**
```
[요청] → CachedFetcher.get(key)
              │
         캐시 확인 ──→ HIT (유효) ──→ 반환
              │
         MISS/만료
              │
         fetcher(key) → 원본 조회
              │
         캐시 저장 → 반환
```

**3. Phase별 책임**

| Phase | 입력 | 출력 | 책임 |
|---|---|---|---|
| 캐시 확인 | key | cached 또는 null | TTL 유효성 판단 |
| 원본 조회 | key | fresh value | 실제 데이터 소스 접근 |
| 캐시 저장 | key, value | - | 다음 요청을 위한 저장 |

**4. 예시 데이터 트레이스**
```
get("user:42")  — 첫 번째 호출 (MISS)

Step 1 - 캐시 확인:
  cache.get("user:42") → undefined (MISS)

Step 2 - 원본 조회:
  fetcher("user:42") → { name: "Alice", role: "admin" }

Step 3 - 캐시 저장:
  cache.set("user:42", { value: {...}, timestamp: 1709500000000 })

→ 반환: { name: "Alice", role: "admin" }

---
get("user:42")  — 두 번째 호출 (HIT, TTL 60초 내)

Step 1 - 캐시 확인:
  cache.get("user:42") → { value: {...}, timestamp: 1709500000000 }
  now - timestamp = 5000ms < TTL(60000ms) → ✅ 유효

→ 반환: { name: "Alice", role: "admin" } (fetcher 호출 없음)
```

**5. 주의점 + Why-Not**
> Q: "왜 단순 TTL이야? LRU 캐시를 안 쓴 이유는?"
> A: LRU는 "가장 오래 안 쓴 항목 삭제"인데, 자주 조회되는 오래된 데이터가 갱신 없이 살아남는다.
> TTL은 "데이터 신선도"를 보장하므로, 정합성이 중요한 경우에 적합하다.
> 트레이드오프: TTL만 쓰면 메모리 무한 증가 가능 — 실제로는 TTL + maxSize를 함께 쓴다.

## 적용 예시: Quick

**질문**: "이 debounce 함수가 뭐야?"

**판단**: "뭐야" → 기능 파악. 파일 1개 → Quick.

**1. 한 문장 요약**: 이 함수는 연속 호출을 받아서, 마지막 호출 후 일정 시간이 지나야 실제로 실행한다.

**2. 데이터 트레이스**:
```
debounce(fn, 300ms) → 300ms 이내 재호출 시 타이머 리셋

호출 시점:  0ms   50ms  100ms  200ms  ────── 500ms
실행 여부:   ❌     ❌     ❌     ❌              ✅ (200ms + 300ms = 500ms에 실행)
```

**3. 주의점**: delay 동안 한 번도 실행 안 되므로 즉시 반응이 필요한 곳에는 throttle을 쓴다.

## Common Mistakes

| 실수 | 해결 |
|---|---|
| 청자가 뭘 알고 싶은지 안 물어봄 | 설명 전 **질문 유형을 먼저 판단** (뭐야/어떻게/왜) |
| 코드를 한 줄씩 읽어주기 | **의미 단위(chunk)**로 묶어서 설명 |
| 비유만 하고 끝냄 | 비유는 직관 잡기용, 반드시 **구체적 트레이스**가 따라옴 |
| "당연히", "간단히" 사용 | 이 단어가 나오면 **설명이 부족하다는 신호** |
| 전체 그림 없이 디테일 시작 | **조감도 → 디테일** 순서를 반드시 지킨다 |
| 비유의 한계를 안 밝힘 | 비유가 깨지는 지점을 명시하지 않으면 **오개념** 형성 |
| 추상적 설명만 함 | 반드시 **구체적 입력값**으로 트레이스 포함 |
