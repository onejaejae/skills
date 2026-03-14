# Changelog

## [1.4.0] - 2026-03-06

### Added
- `cross-review` 서브커맨드: 기존 Pass 1 결과로 Pass 2(교차 검토)만 독립 실행 가능
- `test-cross-review.sh`: synthetic finding 주입으로 AGREE/IGNORE/PRIORITY_ADJUST 3가지 action 타입 검증 스크립트
- `.claude-plugin/plugin.json` 매니페스트 및 마켓플레이스 등록

### Fixed
- 교차 검토 reasoning 텍스트 절단 수정 (MAX_REASON_LENGTH 300→800)

## [1.3.0] - 2026-03-06

### Added
- Cross-review 프롬프트 재설계: anti-sycophancy framing, evidence packets, reasoning-before-verdict
- 3+1 Pass pipeline (Independent Review → Cross-Review → Validation → Chairman)

## [1.0.0] - 2026-03-05

### Added
- 초기 릴리스: Claude, Gemini, Codex 병렬 코드 리뷰
- Chairman AI synthesis
- File context 지원
