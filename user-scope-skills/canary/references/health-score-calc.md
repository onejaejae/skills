# Health Score Calculation

0-100 감점 방식. baseline 대비 변화를 측정.

## 감점 항목

| 항목 | 감점 | 조건 |
|------|------|------|
| HTTP 상태 변경 | -30 | 2xx → 4xx/5xx |
| 새 콘솔 에러 타입 | -5/개 | baseline에 없던 에러 |
| 성능 50%+ 저하 | -20 | 응답 시간 baseline 대비 |
| 성능 20%+ 저하 | -10 | 응답 시간 baseline 대비 |
| 새 네트워크 실패 | -10/개 | 요청 실패 |
| 페이지 응답 없음 | -30 | timeout |

## 상태 판정

| 점수 | 상태 | 의미 |
|------|------|------|
| 80-100 | HEALTHY | 정상 운영 |
| 40-79 | DEGRADED | 성능 저하, 모니터링 지속 |
| 0-39 | BROKEN | 심각한 문제, 즉시 알림 |

## Transient Tolerance

단일 이상 감지는 즉시 알림하지 않음.
- 1회 감지: FLAG (내부 기록만)
- 2회 연속 확인: ALERT (사용자에게 알림)

이유: 네트워크 지터, GC pause, Cloud Run cold start 등 일시적 현상 제외.

## Baseline 없을 때

baseline이 없으면 첫 체크를 baseline으로 사용.
이후 체크부터 비교 시작.
