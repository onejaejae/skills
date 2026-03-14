# claude-md-generator

CLAUDE.md 자동 생성 플러그인

## 설치

```bash
/plugin install claude-md-generator@ai-registry
```

## 사용법

### 트리거

- "CLAUDE.md 만들어줘"
- "CLAUDE.md 생성해줘"
- "create CLAUDE.md"
- "generate CLAUDE.md"

### 워크플로우

1. **코드베이스 자동 분석**
   - 설정 파일 분석 (`package.json`, `pyproject.toml` 등)
   - 프로젝트 타입 감지 (Frontend/Backend/Fullstack/Library/CLI)
   - 기술 스택, 커맨드, 환경 변수 추출

2. **사용자 입력 수집**
   - 프로젝트 설명
   - 커밋 규칙 (Conventional Commits / Gitmoji / 자유 형식)
   - 브랜치 전략 (Git Flow / GitHub Flow / Trunk-based)

3. **CLAUDE.md 생성**
   - 분석 결과 + 사용자 입력 병합
   - 프로젝트 타입별 맞춤 섹션 추가

4. **검토 및 저장**
   - 생성 내용 확인
   - 수정 요청 반영

## 생성되는 섹션

| 섹션 | 자동 분석 | 사용자 입력 |
|------|:--------:|:----------:|
| 프로젝트 이름 | O | - |
| 프로젝트 설명 | - | O |
| 기술 스택 | O | - |
| 디렉토리 구조 | O | - |
| 브랜치 전략 | - | O |
| 커밋 규칙 | - | O |
| 코딩 컨벤션 | O | - |
| 주요 커맨드 | O | - |
| 환경 변수 | O | - |
| 테스트 | O | - |

## 버전

- Current: 1.0.0
- [CHANGELOG](./CHANGELOG.md)
