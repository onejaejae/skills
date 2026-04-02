# rulph

루브릭 기반 반복 자율 개선 루프 — 커스텀 루브릭을 대화로 수립하고, 멀티 모델 병렬 평가 후 임계값 달성까지 자율 개선합니다.

## 설치

```bash
/plugin install rulph@ai-registry
```

## 사용법

### 트리거

- `/rulph`, `rubric evaluate`, `rubric score`
- `multi-model evaluate`, `score and improve`, `grade this`
- `루브릭 루프`, `채점 루프`, `자율 개선`, `개선 루프`

### 핵심 동작 (4 Phase)

```
Phase 1: 루브릭 수립 (대화형)
  ├── Step 1: 평가 기준 수집 (최소 2개)
  ├── Step 2: 루브릭 초안 확인 (체크리스트 분해, 가중치)
  └── Step 3: 임계값 + per-criterion floor 설정

Phase 2: 멀티 모델 평가
  ├── Codex / Gemini / Claude 병렬 실행
  ├── 점수 집계 (가중 평균)
  └── 수렴/발산 분석, 개선 제안 합성

Phase 3: 자율 개선 루프
  ├── 임계값 + floor 통과 시 → Phase 4
  ├── circuit breaker (max_rounds, 정체 감지, 회귀 감지)
  └── 최저 기준 → 워커 에이전트 개선 → 재평가

Phase 4: 완료
  └── 최종 리포트 + 점수 이력 자동 저장
```

### 비용 안내

| 구성 요소 | 라운드당 | 최대 (5라운드) |
|---------|---------|--------------|
| 멀티 모델 평가 (3개) | 3회 LLM 호출 | 15회 |
| 개선 워커 에이전트 | 1회 LLM 호출 | 5회 |
| **합계** | **~4회** | **~20회** |

### 유사 스킬 비교

| 스킬 | 목적 | 핵심 차이 |
|------|------|----------|
| `/rulph` | 루브릭 기반 반복 개선 | 커스텀 루브릭 + 멀티 모델 + 자율 개선 루프 |
| `/check` | 푸시 전 변경 검증 | 규칙 기반 체크리스트, 점수·개선 없음 |
| `/tribunal` | 3관점 적대적 리뷰 | 고정 축(Risk/Value/Feasibility), 1회 판정 |
| `/council` | 다관점 심의 | 팀 기반 토론, 채점 루브릭 없음 |

## 버전

- Current: 1.0.0
- [CHANGELOG](./CHANGELOG.md)
