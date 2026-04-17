# Changelog

## [1.0.0] - 2026-04-02

### Added
- user scope skill을 plugin으로 전환
- 대화형 루브릭 수립 3단계 (기준 수집 → 초안 확인 → 임계값 설정)
- 체크리스트 분해 기반 채점 (서브아이템별 yes/no, 질적 폴백 지원)
- 멀티 모델 병렬 평가 (Codex, Gemini, Claude subagent)
- 점수 집계 및 수렴/발산 분석
- 자율 개선 루프 (floor 위반 우선, 최저 기준 순 개선)
- Stagnation 감지 3종 (점수 회귀, 정체, 진동)
- Circuit breaker (max_rounds 5, iteration 15)
- 최종 리포트 자동 저장 (~/.hoyeon/{session}/tmp/rulph/)
