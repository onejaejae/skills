# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2025-01-23

### Added
- Phase 0: Scope 선택 (project vs user)
  - project scope: `./.claude/skills/` - 현재 프로젝트 전용 스킬
  - user scope: `~/.claude/skills/` - 모든 프로젝트에서 사용

### Changed
- Phase 1에서 선택된 scope에 따라 `--path` 옵션 자동 지정

## [1.0.0] - 2025-01-23

### Added
- Initial release of skill-workflow plugin
- `/create-skill` command: 스킬 생성-테스트-개선 통합 워크플로우
- 번들된 스킬:
  - `skill-creator`: 스킬 생성 가이드
  - `skill-test`: TDD 기반 테스트 방법론
- 5 Phase workflow:
  - Phase 1: 스킬 생성 (skill-creator 실행)
  - Phase 2: Baseline 테스트 (skill-test RED 실행)
  - Phase 3: Compliance 검증 (skill-test GREEN 실행)
  - Phase 4: 결과 리뷰 & 사용자 확인
  - Phase 5: 개선 (REFACTOR) - 조건부 반복
