## Frontend 특화 리뷰 관점

이 PR은 **프론트엔드 코드**를 포함합니다. 아래 6개 카테고리를 추가로 점검하세요.
발견된 이슈는 기존 카테고리(security, performance, quality, testing)로 분류하세요.

---

### 1. 렌더링 성능 → category: `performance`

| 체크포인트 | 설명 |
|-----------|------|
| 불필요한 re-render | props/state가 변경되지 않았는데 렌더링되는 컴포넌트. `React.memo`, `useMemo`, `useCallback` 누락 여부 확인 |
| `key={index}` 사용 | 리스트 항목이 추가/삭제/재정렬될 수 있는 경우 index를 key로 사용하면 DOM 불일치 및 상태 손실 발생 |
| 대량 리스트 가상화 누락 | 100+ 항목을 한 번에 렌더링하면서 가상화(virtualization) 미적용 시 성능 저하 |
| Layout thrashing | 읽기(offsetHeight 등)와 쓰기(style 변경)를 루프에서 번갈아 수행하면 강제 리플로우 발생 |
| 번들 크기 영향 | 큰 라이브러리의 전체 import (`import _ from 'lodash'` 대신 `import debounce from 'lodash/debounce'`), dynamic import 가능한 무거운 컴포넌트 |
| 이미지 최적화 | 큰 이미지를 `<img>`로 직접 로드하면서 lazy loading, srcset, 최적화 포맷(WebP/AVIF) 미사용 |

---

### 2. 접근성 (a11y) → category: `quality`

| 체크포인트 | 설명 |
|-----------|------|
| 시맨틱 HTML 미사용 | 클릭 가능한 `<div>`, `<span>` — `<button>`, `<a>`, `<nav>`, `<main>`, `<article>` 등 적절한 태그 사용 여부 |
| ARIA 속성 누락 | 커스텀 컴포넌트(모달, 드롭다운, 탭 등)에 `role`, `aria-label`, `aria-expanded`, `aria-live` 등 필수 속성 미적용 |
| 키보드 내비게이션 | Tab 순서 부자연스러움, Enter/Space/Escape 핸들링 누락, focus trap 미구현(모달) |
| Focus 관리 | 라우트 전환·모달 열림·동적 콘텐츠 추가 시 포커스 이동 처리 누락 |
| 색상 대비 | 텍스트-배경 간 WCAG 2.1 AA 기준(4.5:1) 미충족 가능성 |
| alt 텍스트 | `<img>` 태그에 의미 있는 `alt` 속성 누락 또는 빈 문자열(`alt=""`)을 장식 이미지가 아닌 곳에 사용 |

---

### 3. 컴포넌트 설계 → category: `quality`

| 체크포인트 | 설명 |
|-----------|------|
| Prop drilling 3+ 단계 | 3단계 이상 props를 전달하면 Context, composition, 또는 상태 관리 도입 검토 |
| God component | 300줄+ 컴포넌트 — 표현·로직·데이터 페칭이 혼재하면 분리 제안 |
| Boolean prop 폭발 | `<Button primary outlined disabled loading />` — variant/상태 enum으로 통합 가능 여부 |
| 관심사 미분리 | 비즈니스 로직과 UI 로직이 하나의 컴포넌트에 혼재. 커스텀 훅이나 container/presentational 분리 검토 |
| 하드코딩된 값 | 컴포넌트 내 직접 하드코딩된 색상, 크기, URL 등 — theme/config/상수로 분리 검토 |

---

### 4. 상태 관리 → category: `quality`

| 체크포인트 | 설명 |
|-----------|------|
| Server/Client 상태 혼재 | API 응답 데이터를 로컬 state에 복사하여 이중 관리. React Query/SWR/TanStack Query 등 서버 상태 라이브러리 사용 검토 |
| Stale closure | useEffect/useCallback 내부에서 오래된 state/props 참조. 의존성 배열 누락 또는 부정확 |
| 파생 상태 중복 | state A에서 계산 가능한 값을 별도 state B로 관리 — `useMemo`로 파생하거나 렌더 시 계산 |
| 전역 상태 과다 사용 | 컴포넌트 로컬로 충분한 상태를 전역 스토어에 저장 — 불필요한 결합도 증가 |
| 비동기 상태 처리 | loading/error/success 상태를 개별 boolean으로 관리하면 불가능한 상태 조합 발생 가능 — 상태 머신 또는 union 타입 검토 |

---

### 5. 프론트엔드 보안 → category: `security`

| 체크포인트 | 설명 |
|-----------|------|
| XSS 벡터 | `dangerouslySetInnerHTML` (React), `v-html` (Vue), `[innerHTML]` (Angular) 사용 시 사용자 입력이 sanitize 없이 주입되는지 확인 |
| 클라이언트 시크릿 노출 | API 키, 비밀번호, 토큰이 클라이언트 번들에 포함되는지 확인. `NEXT_PUBLIC_`, `VITE_` 등 환경변수 접두사 주의 |
| URL 기반 주입 | `window.location`, URL 파라미터를 검증 없이 `href`, `src`, `fetch()` URL에 사용 — open redirect, SSRF 위험 |
| 민감 데이터 로컬 저장 | localStorage/sessionStorage에 토큰·개인정보 저장 — XSS 시 탈취 위험 |
| postMessage 검증 | `window.addEventListener('message', ...)` 에서 origin 검증 없이 메시지 처리 |

---

### 6. 메모리 누수 → category: `performance`

| 체크포인트 | 설명 |
|-----------|------|
| Effect cleanup 누락 | `useEffect`에서 구독(subscription), 이벤트 리스너, WebSocket 연결 시 cleanup 함수 미반환 |
| Timer 미해제 | `setInterval`, `setTimeout`을 컴포넌트에서 사용하면서 `clearInterval`/`clearTimeout` cleanup 없음 |
| 언마운트 후 setState | 비동기 작업(fetch, setTimeout) 완료 후 이미 언마운트된 컴포넌트에 상태 업데이트 시도 |
| AbortController 미사용 | fetch 요청에 AbortController 미적용 — 컴포넌트 언마운트 시 불필요한 네트워크 응답 처리 |
| DOM 참조 누적 | ref를 통해 DOM 노드를 저장하면서 해제하지 않는 패턴 — 특히 리스트나 동적 컴포넌트에서 주의 |

---

> **주의**: 위 체크포인트는 추가 관점입니다. 기본 리뷰 관점(보안, 성능, 품질, 테스트)도 반드시 함께 수행하세요.
> 발견된 이슈의 `category`는 반드시 기존 4개(security, performance, quality, testing) 중 하나로 분류하세요.
