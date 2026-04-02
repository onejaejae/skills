# Changelog

## [1.0.0] - 2026-04-02

### Added
- user scope skill을 plugin으로 전환
- DoD 기반 반복 완료 루프 (Phase 1: DoD 수집, Phase 2: 작업 실행)
- Stop hook 기반 재주입 및 독립 검증 (ralph-verifier 에이전트)
- AskUserQuestion을 통한 DoD 대화형 확인
- 최대 반복 횟수 설정 (기본값 10회, circuit breaker)
- 세션 범위 상태 파일 (hoyeon-cli session set, .ralph 네임스페이스)
- DoD 파일 경로 저장 및 Stop hook 재주입 프롬프트 보관
