# Known Bug Patterns

6가지 알려진 버그 패턴. Phase 1에서 증상과 매칭하여 가설 수립의 출발점으로 사용.

## 1. Race Condition

**증상:** 동시 요청에서만 발생, 단일에서는 정상, 타이밍 의존적, 데이터 꼬임
**시그니처:** shared mutable state, missing locks, non-atomic read-modify-write
**검증:** 동시 요청 재현, 로그에 interleaving 확인

## 2. Nil/Null Propagation

**증상:** `NoneType has no attribute`, `KeyError`, 간헐적 (특정 입력에서만)
**시그니처:** chained `.get()`, optional 반환값 미체크, 외부 API 응답 구조 변동
**검증:** 실패 시점의 입력 데이터 캡처, null이 되는 경로 추적

## 3. State Corruption

**증상:** "이전 요청의 데이터가 섞임", 싱글톤/클래스 변수 오염, 세션 누수
**시그니처:** 클래스 레벨 mutable state, global dict/list, 캐시 무효화 실패
**검증:** 연속 요청에서 상태 덤프 비교

## 4. Integration Failure

**증상:** 외부 API 호출 실패, 타임아웃, 응답 형식 변경, 인증 만료
**시그니처:** API 버전 불일치, 토큰 만료, rate limit, 네트워크 분단
**검증:** 외부 API 직접 호출하여 응답 확인, 로그에서 HTTP 상태 코드 확인

## 5. Configuration Drift

**증상:** "로컬에서는 되는데 프로덕션에서 안 됨", 환경별 차이
**시그니처:** 환경변수 누락, .env 불일치, 시크릿 만료, 리전/타임존 차이
**검증:** 환경 간 설정 diff, 환경변수 목록 비교

## 6. Stale Cache

**증상:** "수정했는데 반영이 안 됨", 간헐적 오래된 데이터 반환
**시그니처:** CDN 캐시, in-memory 캐시 TTL, 빌드 아티팩트, DNS 캐시
**검증:** 캐시 무효화 후 재시도, 캐시 키 확인
