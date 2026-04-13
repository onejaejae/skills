---
name: pr-diff-summary
description: >
  PR diff를 받아 코드 리뷰 자동 요약을 생성하는 스킬.
  핵심 변경점을 3줄로 요약하고, 변경 파일별로 what changed / why it matters / risk level을 정리.
  Use when: "PR 요약", "diff 요약", "PR 변경점 정리", "코드 변경 요약",
  "summarize PR", "PR summary", "diff summary", "what changed in this PR",
  "변경점 요약해줘", "PR 핵심 정리", "리뷰 요약"
---

# PR Diff Summary

PR의 diff를 분석하여 핵심 변경점을 3줄로 요약하고, 파일별로 구조화된 리뷰 요약을 생성한다.

---

## 사용법

```
PR 26번 요약해줘
PR diff 정리해줘 #123
이 PR 변경점 요약해줘
```

---

## Workflow

```
Step 1: PR 정보 수집 (diff + metadata)
Step 2: 3-Line Executive Summary 생성
Step 3: 파일별 상세 분석 (What / Why / Risk)
Step 4: 최종 리포트 출력
```

모든 단계는 자동으로 진행되며, 사용자 승인 없이 한 번에 결과를 출력한다.

---

## Step 1: PR 정보 수집

### PR 번호가 주어진 경우

```bash
# PR 메타데이터
gh pr view <PR_NUMBER> --json title,body,files,additions,deletions,author,baseRefName,headRefName,labels

# PR diff (핵심)
gh pr diff <PR_NUMBER>

# 커밋 히스토리
gh pr view <PR_NUMBER> --json commits --jq '.commits[].messageHeadline'
```

### 로컬 브랜치인 경우

```bash
# base 브랜치 대비 diff
git diff main...HEAD

# 커밋 로그
git log main..HEAD --oneline

# 변경 파일 목록
git diff main...HEAD --stat
```

### 수집할 정보
- PR 제목, 설명, 작성자
- 전체 diff 내용
- 변경 파일 목록 및 각 파일의 additions/deletions
- 커밋 메시지들 (의도 파악용)

---

## Step 2: 3-Line Executive Summary

diff 전체를 분석하여 **정확히 3줄**로 핵심을 요약한다.

### 작성 규칙

1. **Line 1 - WHAT**: 이 PR이 무엇을 하는가 (기능/수정/리팩토링)
2. **Line 2 - HOW**: 어떤 접근 방식으로 구현했는가 (핵심 기술적 변경)
3. **Line 3 - IMPACT**: 이 변경이 시스템에 미치는 영향 (사용자/성능/안정성)

### 출력 형식

```
## 3-Line Summary

1. [WHAT] 사용자 인증 플로우에 OAuth2 소셜 로그인 기능을 추가
2. [HOW] Google/GitHub provider를 strategy pattern으로 구현하고, 기존 세션 관리와 통합
3. [IMPACT] 신규 가입 전환율 개선 예상, 기존 이메일 로그인 플로우에는 영향 없음
```

---

## Step 3: 파일별 상세 분석

변경된 각 파일(또는 논리적 파일 그룹)에 대해 3가지 관점으로 분석한다.

### 분석 관점

| 관점 | 설명 | 분석 방법 |
|------|------|----------|
| **What Changed** | 이 파일에서 구체적으로 무엇이 변경되었는가 | diff 내용 기반, 함수/클래스/설정 단위 |
| **Why It Matters** | 이 변경이 왜 중요한가, 어떤 맥락인가 | PR 설명 + 커밋 메시지 + 코드 맥락 |
| **Risk Level** | 이 변경의 위험도는 어느 정도인가 | 아래 Risk 판단 기준 참조 |

### Risk Level 판단 기준

| Level | 기준 | 예시 |
|-------|------|------|
| **LOW** | 문서, 테스트, 설정값 변경, 리팩토링(동작 불변) | README 수정, 테스트 추가, 변수명 변경 |
| **MEDIUM** | 기존 로직 수정, 새 기능 추가, 의존성 변경 | 새 API 엔드포인트, 비즈니스 로직 변경 |
| **HIGH** | 인증/인가, 데이터 마이그레이션, 핵심 인프라, 삭제 | DB 스키마 변경, 보안 로직, 결제 로직 |
| **CRITICAL** | 프로덕션 데이터 직접 접근, 보안 크리덴셜, 롤백 불가 변경 | 마이그레이션 스크립트, 환경변수 변경 |

### Risk 판단 시 체크포인트

다음 항목 중 해당하는 것이 있으면 Risk를 한 단계 올린다:

- [ ] 에러 핸들링 없이 외부 서비스 호출
- [ ] 하위 호환성이 깨지는 API 변경
- [ ] 테스트 없는 비즈니스 로직 변경
- [ ] 동시성/레이스 컨디션 가능성
- [ ] 환경별 동작 차이 가능성 (dev/staging/prod)

### 파일 그룹핑 규칙

파일이 10개 이상일 때는 논리적으로 그룹핑한다:

- 같은 모듈/패키지의 파일 → 하나의 그룹
- 테스트 파일 → 별도 그룹
- 설정/인프라 파일 → 별도 그룹
- 문서 파일 → 별도 그룹

---

## Step 4: 최종 리포트 출력

### 출력 템플릿

```markdown
# PR #{number}: {title}
> Author: {author} | Files: {file_count} | +{additions}/-{deletions}

---

## 3-Line Summary

1. **[WHAT]** {한 줄 요약: 이 PR이 무엇을 하는가}
2. **[HOW]** {한 줄 요약: 어떻게 구현했는가}
3. **[IMPACT]** {한 줄 요약: 시스템에 미치는 영향}

---

## File-by-File Analysis

### {파일경로 또는 그룹명} (+{additions}/-{deletions})

| Aspect | Detail |
|--------|--------|
| **What Changed** | {구체적 변경 내용} |
| **Why It Matters** | {변경의 중요성과 맥락} |
| **Risk Level** | {LOW/MEDIUM/HIGH/CRITICAL} - {이유 한 줄} |

### {다음 파일...}
...

---

## Risk Heatmap

| Risk | Files |
|------|-------|
| CRITICAL | {파일 목록 또는 "없음"} |
| HIGH | {파일 목록 또는 "없음"} |
| MEDIUM | {파일 목록} |
| LOW | {파일 목록} |

---

## Reviewer Checklist

위 분석 기반으로, 리뷰어가 특히 주의해서 봐야 할 포인트:

- [ ] {HIGH/CRITICAL 파일에서 확인할 사항 1}
- [ ] {HIGH/CRITICAL 파일에서 확인할 사항 2}
- [ ] {테스트 커버리지 관련 사항}
```

---

## 대규모 PR 처리

### 파일 수 > 20개

파일이 20개를 넘으면:
1. `--stat` 출력을 먼저 분석하여 변경량 기준 상위 10개 파일에 집중
2. 나머지는 그룹 단위로 요약
3. 리포트 상단에 "대규모 PR - 핵심 파일 중심 분석" 표기

### Diff가 너무 클 때

diff가 1000줄을 넘으면:
1. `gh pr diff` 대신 `gh pr view --json files`로 파일 목록 먼저 확인
2. HIGH risk 가능성이 있는 파일의 diff만 선택적으로 조회:
   ```bash
   gh pr diff <PR_NUMBER> -- <specific_file_path>
   ```
3. LOW risk 파일(문서, 테스트)은 stat 정보만으로 요약

---

## Examples

### 예시 1: 소규모 기능 추가 PR

```markdown
# PR #42: feat: 사용자 프로필 이미지 업로드 기능

> Author: kim | Files: 4 | +120/-15

---

## 3-Line Summary

1. **[WHAT]** 사용자 프로필 페이지에 이미지 업로드 기능을 추가
2. **[HOW]** S3 presigned URL 방식으로 클라이언트 직접 업로드 구현, 서버는 URL 발급만 담당
3. **[IMPACT]** 새 기능 추가로 기존 플로우 영향 없음, S3 버킷 설정 필요

---

## File-by-File Analysis

### src/api/profile.py (+45/-5)

| Aspect | Detail |
|--------|--------|
| **What Changed** | `upload_profile_image` 엔드포인트 추가, presigned URL 생성 로직 |
| **Why It Matters** | 핵심 비즈니스 로직, 파일 크기/타입 검증 포함 |
| **Risk Level** | MEDIUM - 새 API 엔드포인트, S3 연동 |

### src/services/s3.py (+55/-0)

| Aspect | Detail |
|--------|--------|
| **What Changed** | S3 presigned URL 생성 서비스 클래스 신규 |
| **Why It Matters** | 외부 서비스(AWS) 연동, 크리덴셜 관리 |
| **Risk Level** | HIGH - AWS 크리덴셜 사용, 에러 핸들링 확인 필요 |

### src/models/user.py (+5/-5)

| Aspect | Detail |
|--------|--------|
| **What Changed** | User 모델에 `profile_image_url` 필드 추가 |
| **Why It Matters** | DB 스키마 변경 |
| **Risk Level** | MEDIUM - 마이그레이션 필요 |

### tests/test_profile.py (+15/-5)

| Aspect | Detail |
|--------|--------|
| **What Changed** | 업로드 API 테스트 3건 추가 |
| **Why It Matters** | 핵심 로직 테스트 커버리지 |
| **Risk Level** | LOW - 테스트 코드 |

---

## Risk Heatmap

| Risk | Files |
|------|-------|
| CRITICAL | 없음 |
| HIGH | src/services/s3.py |
| MEDIUM | src/api/profile.py, src/models/user.py |
| LOW | tests/test_profile.py |

---

## Reviewer Checklist

- [ ] s3.py: AWS 크리덴셜이 환경변수로 관리되는지 확인
- [ ] s3.py: presigned URL 만료 시간 적절한지 확인
- [ ] profile.py: 파일 크기/타입 검증 로직 우회 가능성 확인
- [ ] user.py: DB 마이그레이션 스크립트 포함 여부 확인
```

### 예시 2: 대규모 리팩토링 PR

```markdown
# PR #89: refactor: 레거시 인증 모듈을 새 아키텍처로 마이그레이션

> Author: park | Files: 23 | +450/-380

---

## 3-Line Summary

1. **[WHAT]** 레거시 세션 기반 인증을 JWT + refresh token 아키텍처로 전면 교체
2. **[HOW]** 기존 AuthManager를 TokenService/SessionService로 분리하고, middleware 체인 재구성
3. **[IMPACT]** 인증 전체 플로우 변경으로 모든 API 엔드포인트에 영향, 하위 호환 레이어 포함

---

## File-by-File Analysis

### Auth Core (src/auth/) (+200/-180) - 5 files

| Aspect | Detail |
|--------|--------|
| **What Changed** | AuthManager 삭제, TokenService/SessionService 신규, JWT 발급/검증 로직 |
| **Why It Matters** | 인증 시스템의 핵심 변경, 모든 API에 영향 |
| **Risk Level** | CRITICAL - 인증/인가 핵심 로직 전면 교체 |

### Middleware (src/middleware/) (+80/-60) - 3 files

| Aspect | Detail |
|--------|--------|
| **What Changed** | auth middleware 체인 재구성, JWT 검증 미들웨어 추가 |
| **Why It Matters** | 모든 요청의 인증 처리 경로 변경 |
| **Risk Level** | HIGH - 미들웨어 순서 오류 시 전체 API 영향 |

### Tests (tests/auth/) (+120/-90) - 8 files

| Aspect | Detail |
|--------|--------|
| **What Changed** | 기존 세션 테스트 삭제, JWT 기반 테스트 전면 재작성 |
| **Why It Matters** | 새 인증 로직의 정합성 검증 |
| **Risk Level** | LOW - 테스트 코드 |

### Config & Migration (+50/-50) - 7 files

| Aspect | Detail |
|--------|--------|
| **What Changed** | JWT 관련 환경변수, DB 마이그레이션(refresh_token 테이블) |
| **Why It Matters** | 배포 시 환경 설정 필요, 롤백 시 DB 고려 |
| **Risk Level** | HIGH - 환경변수 누락 시 장애, 마이그레이션 롤백 복잡 |

---

## Risk Heatmap

| Risk | Files |
|------|-------|
| CRITICAL | src/auth/ (5 files) |
| HIGH | src/middleware/ (3 files), config & migration (7 files) |
| MEDIUM | 없음 |
| LOW | tests/ (8 files) |

---

## Reviewer Checklist

- [ ] auth/: JWT secret rotation 전략 확인
- [ ] auth/: refresh token 만료/갱신 로직 검증
- [ ] middleware/: 미들웨어 체인 순서 정확한지 확인
- [ ] migration/: 롤백 마이그레이션 포함 여부
- [ ] config/: 모든 환경(dev/staging/prod) 환경변수 매핑 확인
- [ ] 하위 호환: 기존 세션 토큰 보유 사용자 처리 방안 확인
- [ ] 전체: 통합 테스트에서 인증 플로우 end-to-end 검증
```

---

## 주의사항

1. **요약은 정확히 3줄**: 3줄을 넘기지 않는다. 핵심만 압축한다.
2. **Risk는 보수적으로**: 판단이 애매하면 한 단계 높게 평가한다.
3. **Why It Matters는 비즈니스 관점**: 기술적 설명보다 "왜 이게 중요한지"에 초점을 둔다.
4. **커밋 메시지 활용**: PR 설명이 부실할 때 커밋 메시지에서 의도를 파악한다.
5. **그룹핑은 유연하게**: 관련 파일은 묶되, 중요한 파일은 개별 분석한다.
