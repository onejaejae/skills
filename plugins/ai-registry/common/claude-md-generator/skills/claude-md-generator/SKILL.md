---
name: claude-md-generator
description: >
  CLAUDE.md 파일 생성 스킬. 코드베이스 자동 분석과 사용자 입력을 결합하여
  프로젝트별 맞춤 CLAUDE.md를 생성합니다.
  "CLAUDE.md 만들어줘", "CLAUDE.md 생성해줘", "CLAUDE.md 작성해줘",
  "create CLAUDE.md", "generate CLAUDE.md" 등 CLAUDE.md 생성 요청 시 사용.
---

# CLAUDE.md Generator

코드베이스 자동 분석 + 사용자 입력을 결합하여 프로젝트별 맞춤 CLAUDE.md를 생성합니다.

---

## 워크플로우

### Phase 1: 코드베이스 자동 분석

다음 파일들을 분석하여 프로젝트 정보를 수집합니다.

**분석 대상:**

| 파일 | 추출 정보 |
|------|----------|
| `package.json` | 이름, 기술 스택, 스크립트 |
| `pyproject.toml` | 이름, 의존성, 스크립트 |
| `go.mod` | 모듈명, 의존성 |
| `Cargo.toml` | 이름, 의존성 |
| `.eslintrc*`, `eslint.config.*` | JS/TS 코딩 컨벤션 |
| `ruff.toml`, `pyproject.toml [tool.ruff]` | Python 코딩 컨벤션 |
| `.env.example` | 환경 변수 |
| `Makefile` | 주요 커맨드 |
| `jest.config.*`, `vitest.config.*` | JS 테스트 설정 |
| `pytest.ini`, `pyproject.toml [tool.pytest]` | Python 테스트 설정 |

**분석 방법:**

```bash
# 디렉토리 구조 (depth 2)
tree -L 2 -d --noreport

# 설정 파일 존재 확인
ls -la package.json pyproject.toml go.mod 2>/dev/null
```

**프로젝트 타입 감지:**
- 감지 로직은 `references/project-type-guide.md` 참조
- Frontend / Backend / Fullstack / Library / CLI 중 하나로 분류

---

### Phase 2: 사용자 질문

AskUserQuestion 도구로 다음 정보를 수집합니다.

**질문 1: 프로젝트 설명**
- header: "설명"
- question: "프로젝트를 한 줄로 설명해주세요."
- 자유 입력 (Other 선택)

**질문 2: 커밋 규칙**
- header: "커밋 규칙"
- question: "어떤 커밋 규칙을 사용하나요?"
- options:
  - Conventional Commits
  - Gitmoji
  - 자유 형식

**질문 3: 브랜치 전략**
- header: "브랜치"
- question: "어떤 브랜치 전략을 사용하나요?"
- options:
  - Git Flow
  - GitHub Flow
  - Trunk-based Development

**질문 4: 추가 컨벤션 (선택)**
- header: "추가 규칙"
- question: "팀에서 사용하는 추가 컨벤션이 있나요? (없으면 '없음' 선택)"
- 자유 입력 (Other 선택)

---

### Phase 3: CLAUDE.md 생성

분석 결과와 사용자 입력을 병합하여 CLAUDE.md를 작성합니다.

**참조 파일:**
- 섹션별 템플릿: `references/template-sections.md`
- 프레임워크별 패턴: `references/framework-patterns.md`
- 프로젝트 타입별 가이드: `references/project-type-guide.md`

**기본 섹션 구성:**

```markdown
# {프로젝트 이름}

{프로젝트 설명}

## 기술 스택
- ...

## 디렉토리 구조
...

## 브랜치 전략
{사용자 선택에 따른 템플릿}

## 커밋 규칙
{사용자 선택에 따른 템플릿}

## 코딩 컨벤션
{자동 분석 결과}

## 주요 커맨드
{자동 분석 결과}

## 환경 변수
{.env.example 기반}

## 테스트
{테스트 프레임워크 기반}
```

**프로젝트 타입별 추가 섹션:**

| 타입 | 추가 섹션 |
|------|----------|
| Frontend | 컴포넌트 규칙, 상태관리 |
| Backend | API 가이드, DB 가이드 |
| Fullstack | 라우팅, 렌더링 전략 |
| Library | 빌드/배포, 버전 관리 |
| CLI | 사용법, 명령어 옵션 |

---

### Phase 4: 검토 및 조정

1. 생성된 CLAUDE.md 내용을 사용자에게 표시
2. 수정 요청 확인
3. 요청에 따라 내용 조정
4. 최종 파일 저장

---

## 체크리스트

### Phase 1 완료 조건
- [ ] 설정 파일 분석 완료
- [ ] 프로젝트 타입 감지 완료
- [ ] 기술 스택 식별 완료

### Phase 2 완료 조건
- [ ] 프로젝트 설명 수집
- [ ] 커밋 규칙 선택
- [ ] 브랜치 전략 선택

### Phase 3 완료 조건
- [ ] 모든 필수 섹션 포함
- [ ] 프로젝트 타입에 맞는 추가 섹션 포함
- [ ] 템플릿과 분석 결과 적절히 병합

### Phase 4 완료 조건
- [ ] 사용자 검토 완료
- [ ] 수정 요청 반영
- [ ] `./CLAUDE.md` 파일 저장
