# CLAUDE.md 섹션별 템플릿

## 목차
1. [프로젝트 정보](#1-프로젝트-정보)
2. [기술 스택](#2-기술-스택)
3. [디렉토리 구조](#3-디렉토리-구조)
4. [브랜치 전략](#4-브랜치-전략)
5. [커밋 규칙](#5-커밋-규칙)
6. [코딩 컨벤션](#6-코딩-컨벤션)
7. [주요 커맨드](#7-주요-커맨드)
8. [환경 변수](#8-환경-변수)
9. [테스트](#9-테스트)

---

## 1. 프로젝트 정보

```markdown
# {project-name}

{project-description}
```

**자동 분석 소스:**
- `package.json` → `name` 필드
- `pyproject.toml` → `[project]` 섹션
- 디렉토리 이름 (fallback)

---

## 2. 기술 스택

```markdown
## 기술 스택

- **언어**: {language} {version}
- **프레임워크**: {framework} {version}
- **패키지 매니저**: {package-manager}
- **주요 라이브러리**:
  - {library-1}
  - {library-2}
```

**자동 분석 소스:**
- `package.json` → `dependencies`, `devDependencies`
- `pyproject.toml` → `[project.dependencies]`
- `requirements.txt`
- `go.mod`
- `Cargo.toml`

---

## 3. 디렉토리 구조

```markdown
## 디렉토리 구조

```
{project-root}/
├── src/           # 소스 코드
├── tests/         # 테스트 코드
├── docs/          # 문서
└── scripts/       # 유틸리티 스크립트
```
```

**자동 분석 방법:**
```bash
tree -L 2 -d --noreport
```

---

## 4. 브랜치 전략

### Git Flow

```markdown
## 브랜치 전략

Git Flow를 사용합니다.

- `main` - 프로덕션 배포 브랜치
- `develop` - 개발 통합 브랜치
- `feature/*` - 기능 개발 브랜치
- `release/*` - 릴리즈 준비 브랜치
- `hotfix/*` - 긴급 수정 브랜치

### 브랜치 네이밍
- 기능: `feature/{issue-number}-{short-description}`
- 버그 수정: `bugfix/{issue-number}-{short-description}`
- 핫픽스: `hotfix/{version}-{short-description}`
```

### GitHub Flow

```markdown
## 브랜치 전략

GitHub Flow를 사용합니다.

- `main` - 항상 배포 가능한 상태 유지
- `feature/*` - 모든 변경은 feature 브랜치에서 작업

### 워크플로우
1. `main`에서 feature 브랜치 생성
2. 변경 사항 커밋
3. PR 생성 및 리뷰
4. `main`으로 머지 후 즉시 배포
```

### Trunk-based Development

```markdown
## 브랜치 전략

Trunk-based Development를 사용합니다.

- `main` - 메인 개발 브랜치
- 단기 feature 브랜치 사용 (1-2일 내 머지)
- Feature flag로 미완성 기능 관리

### 워크플로우
1. `main`에서 짧은 수명의 브랜치 생성
2. 작은 단위로 자주 커밋
3. 빠르게 `main`으로 머지
```

---

## 5. 커밋 규칙

### Conventional Commits

```markdown
## 커밋 규칙

[Conventional Commits](https://www.conventionalcommits.org/)를 따릅니다.

### 형식
```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### 타입
- `feat`: 새로운 기능
- `fix`: 버그 수정
- `docs`: 문서 변경
- `style`: 코드 스타일 변경 (포맷팅 등)
- `refactor`: 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드, 설정 등 기타 변경

### 예시
```
feat(auth): add OAuth2 login support

Implemented Google and GitHub OAuth2 providers.

Closes #123
```
```

### Gitmoji

```markdown
## 커밋 규칙

[Gitmoji](https://gitmoji.dev/)를 사용합니다.

### 형식
```
:emoji: <description>
```

### 주요 이모지
- :sparkles: (`:sparkles:`) - 새 기능
- :bug: (`:bug:`) - 버그 수정
- :memo: (`:memo:`) - 문서 추가/수정
- :recycle: (`:recycle:`) - 리팩토링
- :white_check_mark: (`:white_check_mark:`) - 테스트 추가
- :fire: (`:fire:`) - 코드/파일 삭제
- :lipstick: (`:lipstick:`) - UI/스타일 수정

### 예시
```
:sparkles: Add OAuth2 login support
:bug: Fix authentication token expiration issue
```
```

### 자유 형식

```markdown
## 커밋 규칙

### 형식
```
[Category] Short description
```

### 가이드라인
- 현재 시제로 작성 ("Add feature" not "Added feature")
- 첫 글자 대문자
- 마침표 없이 작성
- 50자 이내로 제목 작성
- 필요시 본문에 상세 내용 추가
```

---

## 6. 코딩 컨벤션

### JavaScript/TypeScript (ESLint 기반)

```markdown
## 코딩 컨벤션

ESLint + Prettier를 사용합니다.

### 주요 규칙
- 들여쓰기: 2 spaces
- 세미콜론: 사용
- 따옴표: 작은따옴표 (`'`)
- 줄 길이: 100자

### 네이밍
- 변수/함수: camelCase
- 클래스/컴포넌트: PascalCase
- 상수: UPPER_SNAKE_CASE
- 파일: kebab-case (컴포넌트는 PascalCase)

### 검사 실행
```bash
npm run lint
npm run lint:fix
```
```

### Python (Ruff 기반)

```markdown
## 코딩 컨벤션

Ruff를 사용합니다.

### 주요 규칙
- 들여쓰기: 4 spaces
- 줄 길이: 88자 (Black 스타일)
- import 정렬: isort 스타일

### 네이밍 (PEP 8)
- 변수/함수: snake_case
- 클래스: PascalCase
- 상수: UPPER_SNAKE_CASE
- private: _leading_underscore

### 검사 실행
```bash
ruff check .
ruff format .
```
```

### Python (Black + isort)

```markdown
## 코딩 컨벤션

Black + isort를 사용합니다.

### 주요 규칙
- Black 기본 설정 사용
- 줄 길이: 88자
- import 정렬: isort

### 검사 실행
```bash
black .
isort .
```
```

### Go (gofmt)

```markdown
## 코딩 컨벤션

gofmt 표준을 따릅니다.

### 주요 규칙
- 들여쓰기: tabs
- gofmt 자동 포맷팅 사용
- golangci-lint로 정적 분석

### 네이밍
- exported: PascalCase
- unexported: camelCase
- 패키지: lowercase, single word

### 검사 실행
```bash
go fmt ./...
golangci-lint run
```
```

---

## 7. 주요 커맨드

### npm 프로젝트

```markdown
## 주요 커맨드

| 명령어 | 설명 |
|--------|------|
| `npm install` | 의존성 설치 |
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 프로덕션 빌드 |
| `npm run test` | 테스트 실행 |
| `npm run lint` | 린트 검사 |
```

### Python 프로젝트

```markdown
## 주요 커맨드

| 명령어 | 설명 |
|--------|------|
| `pip install -e .` | 개발 모드 설치 |
| `python -m pytest` | 테스트 실행 |
| `ruff check .` | 린트 검사 |
| `ruff format .` | 코드 포맷팅 |
```

### Makefile 프로젝트

```markdown
## 주요 커맨드

| 명령어 | 설명 |
|--------|------|
| `make install` | 의존성 설치 |
| `make dev` | 개발 서버 실행 |
| `make build` | 빌드 |
| `make test` | 테스트 실행 |
| `make lint` | 린트 검사 |
```

---

## 8. 환경 변수

```markdown
## 환경 변수

`.env.example`을 복사하여 `.env` 파일 생성:

```bash
cp .env.example .env
```

### 필수 변수

| 변수명 | 설명 | 예시 |
|--------|------|------|
| `DATABASE_URL` | DB 연결 문자열 | `postgresql://...` |
| `API_KEY` | 외부 API 키 | `sk-...` |
| `NODE_ENV` | 실행 환경 | `development` |

### 선택 변수

| 변수명 | 설명 | 기본값 |
|--------|------|--------|
| `PORT` | 서버 포트 | `3000` |
| `LOG_LEVEL` | 로그 레벨 | `info` |
```

---

## 9. 테스트

### Jest (JavaScript/TypeScript)

```markdown
## 테스트

Jest를 사용합니다.

### 실행
```bash
npm test              # 전체 테스트
npm test -- --watch   # watch 모드
npm test -- --coverage # 커버리지 리포트
```

### 테스트 파일 위치
- `__tests__/` 디렉토리 또는
- `*.test.ts`, `*.spec.ts` 파일
```

### pytest (Python)

```markdown
## 테스트

pytest를 사용합니다.

### 실행
```bash
pytest                    # 전체 테스트
pytest -v                 # 상세 출력
pytest --cov=src          # 커버리지 리포트
pytest -k "test_function" # 특정 테스트만 실행
```

### 테스트 파일 위치
- `tests/` 디렉토리
- `test_*.py` 또는 `*_test.py` 파일
```

### Go testing

```markdown
## 테스트

Go 표준 testing 패키지를 사용합니다.

### 실행
```bash
go test ./...           # 전체 테스트
go test -v ./...        # 상세 출력
go test -cover ./...    # 커버리지
go test -run TestFunc   # 특정 테스트만 실행
```

### 테스트 파일 위치
- 같은 패키지 내 `*_test.go` 파일
```
