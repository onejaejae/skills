# OWASP Top 10 (2021) Checklist

각 카테고리별 구체적 체크 항목. Phase 1의 Agent 3이 사용.

## A01: Broken Access Control
- [ ] 엔드포인트별 인증/인가 존재 여부
- [ ] Webhook 서명 검증 (GitHub: X-Hub-Signature-256, GCP: OIDC token)
- [ ] CORS 설정 (허용 오리진 범위)
- [ ] 경로 순회 (path traversal) 가능성
- [ ] IDOR (Insecure Direct Object Reference)

## A02: Cryptographic Failures
- [ ] 하드코딩된 시크릿/API 키/토큰
- [ ] 시크릿 관리 방식 (환경변수 vs 코드)
- [ ] TLS 사용 여부 (HTTP vs HTTPS)
- [ ] 패스워드/토큰 해싱 알고리즘

## A03: Injection
- [ ] SQL Injection (ORM 사용 시에도 raw query 확인)
- [ ] Command Injection (subprocess, os.system)
- [ ] Template Injection (f-string in HTML)
- [ ] LDAP/XPath/NoSQL Injection

## A04: Insecure Design
- [ ] Rate limiting 부재
- [ ] 비즈니스 로직 오용 가능성
- [ ] 비정상 입력에 대한 방어

## A05: Security Misconfiguration
- [ ] 디버그 모드 프로덕션 노출
- [ ] 기본 자격 증명 사용
- [ ] 불필요한 기능/엔드포인트 활성화
- [ ] 에러 메시지 정보 노출

## A06: Vulnerable and Outdated Components
- [ ] 알려진 CVE가 있는 의존성
- [ ] 지원 종료된 라이브러리
- [ ] 의존성 감사 도구 실행 (pip-audit, npm audit 등)

## A07: Identification and Authentication Failures
- [ ] 인증 토큰 만료 정책
- [ ] 세션 관리
- [ ] 다중 인증 (MFA) 고려

## A08: Software and Data Integrity Failures
- [ ] CI/CD 파이프라인 보안
- [ ] 의존성 무결성 검증 (lockfile 해시)
- [ ] 코드 서명

## A09: Security Logging and Monitoring Failures
- [ ] 보안 이벤트 로깅 여부
- [ ] 로그에 민감 정보 포함 여부
- [ ] 알림/모니터링 설정

## A10: Server-Side Request Forgery (SSRF)
- [ ] 사용자 입력이 URL/호스트로 사용되는 곳
- [ ] 내부 서비스 접근 가능성
- [ ] URL 허용 목록/차단 목록
