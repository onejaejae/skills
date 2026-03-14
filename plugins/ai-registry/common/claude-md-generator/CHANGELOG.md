# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2025-01-26

### Added

- 초기 릴리즈
- 코드베이스 자동 분석 기능
  - package.json, pyproject.toml, go.mod 분석
  - ESLint, Ruff 설정 분석
  - 환경 변수, 테스트 설정 분석
- 프로젝트 타입 감지 (Frontend/Backend/Fullstack/Library/CLI)
- 사용자 입력 수집 (AskUserQuestion)
  - 프로젝트 설명
  - 커밋 규칙 (Conventional Commits / Gitmoji / 자유 형식)
  - 브랜치 전략 (Git Flow / GitHub Flow / Trunk-based)
- CLAUDE.md 템플릿 시스템
  - 섹션별 템플릿 (`template-sections.md`)
  - 프레임워크별 패턴 (`framework-patterns.md`)
  - 프로젝트 타입별 가이드 (`project-type-guide.md`)
