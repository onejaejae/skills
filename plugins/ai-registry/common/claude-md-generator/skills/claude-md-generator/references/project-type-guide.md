# 프로젝트 타입 감지 가이드

## 목차
1. [타입 감지 로직](#1-타입-감지-로직)
2. [타입별 권장 섹션](#2-타입별-권장-섹션)
3. [감지 우선순위](#3-감지-우선순위)

---

## 1. 타입 감지 로직

### Frontend

**감지 조건 (OR):**
- `package.json`에 `react`, `vue`, `@angular/core`, `svelte` 의존성
- `vite.config.ts`, `webpack.config.js` 존재 (서버 코드 없음)
- `src/` 또는 `app/` 에 `.jsx`, `.tsx`, `.vue` 파일 주로 존재
- `public/`, `static/` 디렉토리 존재

**확정 조건:**
- 서버 사이드 코드 (`server/`, `api/`, `routes/`) 없음
- `next.config.js`, `nuxt.config.ts` 없음 (Fullstack 제외)

### Backend

**감지 조건 (OR):**
- `package.json`에 `express`, `fastify`, `@nestjs/core`, `koa` 의존성
- `pyproject.toml`에 `fastapi`, `flask`, `django` 의존성
- `go.mod`에 `gin`, `echo`, `fiber` 의존성
- `main.go`, `cmd/` 디렉토리 존재

**확정 조건:**
- 프론트엔드 관련 의존성 (`react`, `vue` 등) 없음
- `public/`, `static/` 디렉토리 없거나 API 문서용

### Fullstack

**감지 조건 (OR):**
- `next.config.js` 또는 `next.config.mjs` 존재
- `nuxt.config.ts` 존재
- `remix.config.js` 존재
- `package.json`에 프론트엔드 + 백엔드 의존성 동시 존재
- `server/` + `client/` 또는 `frontend/` + `backend/` 구조

**확정 조건:**
- 서버 코드와 클라이언트 코드 모두 존재

### Library

**감지 조건 (OR):**
- `package.json`에 `exports` 필드 존재
- `package.json`에 `main`, `module`, `types` 필드 존재
- `pyproject.toml`에 `[build-system]` 섹션 존재
- `lib/`, `dist/`, `build/` 디렉토리 존재
- `tsconfig.json`에 `declaration: true`

**확정 조건:**
- 실행 가능한 애플리케이션 코드 없음
- 빌드 출력이 배포 가능한 패키지 형태

### CLI

**감지 조건 (OR):**
- `package.json`에 `bin` 필드 존재
- `pyproject.toml`에 `[project.scripts]` 섹션 존재
- `Cargo.toml`에 `[[bin]]` 섹션 존재
- `cmd/` 디렉토리에 main 파일 존재
- 파일 상단에 shebang (`#!/usr/bin/env`) 존재

**확정 조건:**
- 웹 서버 관련 코드 없음
- 명령줄 인자 처리 코드 존재 (`commander`, `argparse`, `cobra` 등)

### Monorepo

**감지 조건 (OR):**
- `pnpm-workspace.yaml` 존재
- `lerna.json` 존재
- `package.json`에 `workspaces` 필드 존재
- `packages/`, `apps/` 디렉토리 존재

---

## 2. 타입별 권장 섹션

### Frontend 권장 섹션

| 섹션 | 필수/권장 | 설명 |
|------|:--------:|------|
| 프로젝트 정보 | 필수 | 이름, 설명 |
| 기술 스택 | 필수 | 프레임워크, 상태관리 |
| 디렉토리 구조 | 필수 | 컴포넌트 구조 |
| 컴포넌트 규칙 | 필수 | 네이밍, 파일 구조 |
| 상태 관리 | 권장 | 전역/로컬 상태 구분 |
| 스타일 가이드 | 권장 | CSS 방법론, 테마 |
| 브랜치 전략 | 필수 | |
| 커밋 규칙 | 필수 | |
| 코딩 컨벤션 | 필수 | ESLint 규칙 |
| 주요 커맨드 | 필수 | dev, build, test |
| 환경 변수 | 권장 | API URL 등 |
| 테스트 | 권장 | Jest/Vitest |

### Backend 권장 섹션

| 섹션 | 필수/권장 | 설명 |
|------|:--------:|------|
| 프로젝트 정보 | 필수 | 이름, 설명 |
| 기술 스택 | 필수 | 프레임워크, DB |
| 디렉토리 구조 | 필수 | 레이어 구조 |
| API 가이드 | 필수 | 엔드포인트 규칙 |
| DB 가이드 | 필수 | 모델, 마이그레이션 |
| 인증/인가 | 권장 | 토큰, 세션 |
| 브랜치 전략 | 필수 | |
| 커밋 규칙 | 필수 | |
| 코딩 컨벤션 | 필수 | Linter 규칙 |
| 주요 커맨드 | 필수 | dev, migrate, test |
| 환경 변수 | 필수 | DB, API 키 |
| 테스트 | 필수 | 단위/통합 테스트 |

### Fullstack 권장 섹션

| 섹션 | 필수/권장 | 설명 |
|------|:--------:|------|
| 프로젝트 정보 | 필수 | 이름, 설명 |
| 기술 스택 | 필수 | 전체 스택 |
| 디렉토리 구조 | 필수 | app/pages/server 구조 |
| 라우팅 | 필수 | 파일 기반 라우팅 |
| 렌더링 전략 | 필수 | SSR/SSG/ISR |
| 컴포넌트 규칙 | 필수 | Server/Client 구분 |
| API 라우트 | 필수 | 서버 API 규칙 |
| DB 가이드 | 권장 | ORM, 마이그레이션 |
| 브랜치 전략 | 필수 | |
| 커밋 규칙 | 필수 | |
| 코딩 컨벤션 | 필수 | |
| 주요 커맨드 | 필수 | dev, build |
| 환경 변수 | 필수 | |
| 테스트 | 권장 | |

### Library 권장 섹션

| 섹션 | 필수/권장 | 설명 |
|------|:--------:|------|
| 프로젝트 정보 | 필수 | 이름, 설명, 용도 |
| 기술 스택 | 필수 | 언어, 빌드 도구 |
| 디렉토리 구조 | 필수 | src/lib 구조 |
| API 문서 | 필수 | 공개 API |
| 빌드 설정 | 필수 | 번들러, 타겟 |
| 배포 가이드 | 필수 | npm publish 등 |
| 버전 관리 | 필수 | Semantic versioning |
| 브랜치 전략 | 필수 | |
| 커밋 규칙 | 필수 | |
| 코딩 컨벤션 | 필수 | |
| 주요 커맨드 | 필수 | build, test, publish |
| 테스트 | 필수 | 단위 테스트 |

### CLI 권장 섹션

| 섹션 | 필수/권장 | 설명 |
|------|:--------:|------|
| 프로젝트 정보 | 필수 | 이름, 설명, 용도 |
| 기술 스택 | 필수 | 언어 |
| 설치 방법 | 필수 | npm/pip install |
| 사용법 | 필수 | 기본 명령어 |
| 명령어 옵션 | 필수 | 플래그, 인자 |
| 설정 파일 | 권장 | config 파일 |
| 브랜치 전략 | 필수 | |
| 커밋 규칙 | 필수 | |
| 코딩 컨벤션 | 필수 | |
| 주요 커맨드 | 필수 | dev, build |
| 테스트 | 필수 | |

---

## 3. 감지 우선순위

복수 타입 감지 시 우선순위:

1. **Monorepo** - 최상위에서 먼저 감지
2. **Fullstack** - Next.js/Nuxt 등 명확한 프레임워크
3. **CLI** - `bin` 필드 명시적
4. **Library** - `exports`/빌드 설정 명시적
5. **Backend** - 서버 프레임워크 감지
6. **Frontend** - 기본 폴백

### 복합 타입 처리

**Monorepo 내 패키지:**
- 각 패키지별 타입 개별 감지
- 루트에서는 Monorepo 설정만 문서화
- 패키지별 문서는 각 패키지 내 CLAUDE.md에 위임

**Frontend + Backend 혼합 (Fullstack 아닌 경우):**
```
프로젝트/
├── client/    # Frontend
└── server/    # Backend
```
- 두 디렉토리 별도 섹션으로 문서화
- 공통 섹션(브랜치 전략, 커밋 규칙)은 루트에 통합
