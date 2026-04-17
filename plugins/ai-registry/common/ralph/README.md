# ralph

DoD 기반 반복 완료 루프 — Definition of Done을 대화로 확정하고, Stop hook 재주입으로 모든 항목이 검증될 때까지 자율 반복합니다.

## 설치

```bash
/plugin install ralph@ai-registry
```

## 사용법

### 트리거

- `/ralph`, `ralph loop`, `ralph 루프`
- `반복 작업`, `DoD 루프`, `완료 검증 루프`
- `task loop`, `keep going until done`

### 핵심 동작

```
Phase 1: DoD 수집
  ├── 3~7개 구체적·검증 가능한 완료 기준 제안
  ├── AskUserQuestion으로 사용자 확인 (추가/수정/삭제)
  └── DoD 파일 + 세션 상태 초기화

Phase 2: 작업 실행
  ├── DoD 기준을 만족하도록 작업 수행
  ├── 작업 완료 시 Stop hook이 자동 점검:
  │   ├── 미완료 항목 존재 → 원본 프롬프트 재주입 + 재실행
  │   └── 모든 항목 완료 → 종료 허용
  └── ralph-verifier 에이전트가 독립 검증 (컨텍스트 분리)
```

### 유사 스킬 비교

| 스킬 | 용도 | 선택 기준 |
|------|------|-----------|
| `/ralph` | DoD 기반 반복 루프 + 독립 검증 | 단일 작업, 완료 보장 필요 |
| `/execute` | spec.json 기반 병렬 워커 오케스트레이션 | 구조화된 spec.json 보유 시 |
| `/rulph` | 루브릭 기반 점수 개선 루프 | 채점·반복 개선 필요 시 |
| `/bugfix` | 근본 원인 진단 + spec 생성 + /execute | 버그 리포트 기반 수정 |

### 특징

- Stop hook이 DoD 체크리스트를 독립 검증 — Claude 자기 평가 편향 제거
- 최대 반복 횟수 설정 가능 (기본값 10회, circuit breaker)
- 세션 범위 상태 파일로 크로스 세션 간섭 방지

## 버전

- Current: 1.0.0
- [CHANGELOG](./CHANGELOG.md)
