# False Positive Filters

Phase 3에서 적용하는 17개 필터. 각 필터에 해당하면 해당 finding을 제외하거나 신뢰도를 낮춤.

## Filters

1. **Test Fixture Data** — `tests/`, `test_`, `mock`, `fixture`, `fake` 경로의 시크릿 패턴
2. **Example/Documentation** — `README`, `docs/`, `example`, `sample` 내 코드
3. **Commented Code** — 주석 내 시크릿 패턴 (`#`, `//`, `/* */`)
4. **Environment Template** — `.env.example`, `.env.sample` 내 플레이스홀더
5. **Vendored Dependencies** — `node_modules/`, `vendor/`, `venv/`, `.tox/`
6. **Build Artifacts** — `dist/`, `build/`, `__pycache__/`, `.next/`
7. **Lock Files** — `package-lock.json`, `poetry.lock`, `Pipfile.lock`
8. **Git Ignored Files** — `.gitignore`에 포함된 경로
9. **Known Safe Patterns** — Google Maps API 키 (public embed용), Firebase public config
10. **Base64 Non-Secrets** — Base64 인코딩이지만 시크릿이 아닌 패턴 (이미지 데이터 URI, JWT public claims)
11. **UUID/Hash Identifiers** — UUID v4, SHA hash가 시크릿처럼 보이는 경우 (database ID, commit hash)
12. **Placeholder Values** — `xxx`, `your-api-key-here`, `changeme`, `TODO`
13. **Internal-Only Webhook URLs** — Google Chat Incoming Webhook은 URL 자체가 인증 (bearer token 없이는 무의미)
14. **Public GitHub App IDs** — App ID와 Installation ID는 공개 정보 (private key만 시크릿)
15. **Development-Only Configurations** — `DEBUG=True`, `localhost` 설정이 프로덕션 코드가 아닌 개발 설정에만 있는 경우
16. **Deprecated/Rotated** — git blame 기준 1년 이상 된 시크릿 (이미 로테이션됨을 가정, 확인 필요 플래그)
17. **Cloud Run/GKE Service URLs** — `*.run.app`, `*.svc.cluster.local` 등 인프라 URL은 시크릿이 아님
