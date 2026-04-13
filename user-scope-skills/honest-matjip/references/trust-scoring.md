# Trust Scoring Formula

## 맛집 종합 신뢰 점수

```
restaurant_trust =
    0.50 * mean(reviewer_trust for reviewer in analyzed_reviewers)
  + 0.30 * min(trusted_reviewer_count / 10, 1.0)
  + 0.20 * platform_cross_presence
```

### 구성 요소

| 요소 | 가중치 | 범위 | 설명 |
|------|--------|------|------|
| 리뷰어 평균 신뢰 점수 | 50% | 0~1 | reviewer-analysis.md의 개별 점수 평균 |
| 신뢰 리뷰어 수 | 30% | 0~1 | reviewer_trust > 0.6인 리뷰어 수, 10명 cap |
| 플랫폼 교차 등장 | 20% | 0/0.5/1 | 1소스=0, 2소스=0.5, 3소스=1.0 |

### 필터링 임계값 (v1 보수적)

| 조건 | 액션 |
|------|------|
| `restaurant_trust < 0.5` | 후보에서 제외 |
| `trusted_reviewer_count < 3` | 후보에서 제외 |
| `analyzed_reviewers < 3` | "표본 부족" 경고 부착 후 포함 허용 |

### 랭킹

1차: `restaurant_trust` 내림차순
2차: `trusted_reviewer_count` 내림차순 (동점 시)
3차: `platform_cross_presence` 보너스 있는 쪽 우선

## 점수 해석 가이드

| 범위 | 해석 |
|------|------|
| 0.8+ | 높은 신뢰 — 리뷰어 대부분이 다양한 활동 이력 보유 |
| 0.6~0.8 | 보통 — 일부 의심 신호 있지만 양호 |
| 0.5~0.6 | 경계 — 주의 필요, 경고 부착 |
| < 0.5 | 제외 대상 — 광고 오염 가능성 높음 |

## 중요 원칙

- 점수는 **상대 비교용**이다. "0.73점이니 안전합니다"가 아니라 "분석한 후보 중 가장 신뢰할 수 있었습니다"로 표현
- 표본이 부족하면 점수를 높게 채점하지 마라. 불확실하면 낮게
- 임계값(0.5)은 v1 초기값. 실제 사용하면서 튜닝 필요
