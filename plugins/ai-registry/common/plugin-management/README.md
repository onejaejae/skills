# plugin-management

Claude Code 플러그인 생성 및 업데이트 관리 스킬

## 설치

```bash
/plugin install plugin-management@ai-registry
```

## 사용법

### 트리거

- "플러그인 생성", "플러그인 업데이트"
- "plugin create", "plugin update"
- "새 skill 추가"

### 제공 기능

1. **플러그인 생성**
   - 디렉토리 구조 가이드
   - 매니페스트(plugin.json) 설정
   - 마켓플레이스 등록

2. **플러그인 업데이트**
   - 브랜치 준비
   - 버전 업데이트 (Semantic Versioning)
   - CHANGELOG.md 작성
   - PR 생성

### 플러그인 디렉토리 구조

```
plugins/{domain}/{plugin-name}/
├── .claude-plugin/
│   └── plugin.json          # 필수
├── README.md                 # 권장
├── CHANGELOG.md             # 권장
├── commands/                # 슬래시 명령어
├── skills/                  # 에이전트 스킬
└── agents/                  # 사용자 정의 에이전트
```

## 버전

- Current: 1.0.0
- [CHANGELOG](./CHANGELOG.md)
