---
name: plugin-management
description: >
  Plugin lifecycle management skill.
  Use when creating, updating, or managing Claude Code plugins.
  Trigger: "플러그인 생성", "플러그인 업데이트", "plugin create", "plugin update", "새 skill 추가"
---

# Plugin Management

Claude Code 플러그인의 생성 및 업데이트를 관리합니다.

---

## 플러그인 생성

### 1. 디렉토리 구조

```
plugins/{domain}/{plugin-name}/
├── .claude-plugin/
│   └── plugin.json          # 플러그인 매니페스트 (필수)
├── README.md                # 플러그인 개요 (권장)
├── CHANGELOG.md             # 버전 변경 이력 (권장)
├── commands/                # 슬래시 명령어
│   └── {command-name}.md
├── skills/                  # 에이전트 스킬
│   └── {skill-name}/
│       └── SKILL.md
└── agents/                  # 사용자 정의 에이전트
    └── {agent-name}.md
```

**도메인 분류:**
- `backend/` - 백엔드 관련
- `frontend/` - 프론트엔드 관련
- `common/` - 공통 사용
- `infra/` - 인프라 관련

### 2. 매니페스트 설정 (plugin.json)

**경로:** `{plugin-name}/.claude-plugin/plugin.json`

```json
{
  "name": "plugin-name",
  "description": "플러그인 설명",
  "version": "1.0.0"
}
```

### 3. 마켓플레이스 등록 (marketplace.json)

**경로:** `.claude-plugin/marketplace.json` (저장소 루트)

```json
{
  "plugins": [
    {
      "name": "plugin-name",
      "source": "./plugins/{domain}/{plugin-name}",
      "description": "플러그인 설명",
      "version": "1.0.0"
    }
  ]
}
```

### 4. 컴포넌트 추가

#### Skills (SKILL.md)

```markdown
---
name: skill-name
description: >
  스킬 설명. 트리거 조건 포함.
  Use when "trigger phrase", "another trigger"
---

# Skill Title

## Purpose

## Protocol

## Examples

## Checklist
```

#### Commands ({command}.md)

```markdown
---
allowed-tools: Read, Write, Edit, Bash
argument-hint: [argument-description]
description: 명령어 설명
---

# Command Title

$ARGUMENTS

## 수행 작업
```

---

## 플러그인 업데이트 (배포)

플러그인을 수정하고 새 버전을 배포하는 절차:

### Step 1: 브랜치 준비

```bash
git checkout main
git pull origin main
git checkout -b feat_plugin-update-description
```

### Step 2: 코드 수정

플러그인의 commands/, skills/ 등 필요한 파일 수정

### Step 3: 버전 업데이트

**수정 파일:**
- `plugins/{domain}/{plugin-name}/.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`

**버전 규칙:** MAJOR.MINOR.PATCH
- MAJOR: 호환성 깨지는 변경
- MINOR: 새 기능 추가
- PATCH: 버그 수정

### Step 4: CHANGELOG.md 업데이트

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- 새로운 기능

### Changed
- 변경된 기능

### Fixed
- 수정된 버그
```

### Step 5: 커밋, 푸시 및 PR 생성

```bash
git add .
git commit -m "feat(plugin-name): 변경 내용 요약 (vX.Y.Z)"
git push -u origin feat_plugin-update-description
gh pr create --draft --assignee @me --base main --title "feat(plugin-name): 변경 내용"
```

> PR 생성 시 자동으로 PR Template이 적용됩니다. 아래 항목을 작성하세요:

**PR Template 항목:**
- **Plugin Information**: 플러그인명, 버전 변경, 도메인
- **Change Type**: New Plugin / Feature / Bug Fix / Refactor / Documentation
- **Summary**: 변경 사항 요약 (1-3줄)
- **Checklist**: 버전 업데이트, CHANGELOG, README, 테스트 확인

---

## 체크리스트

### 플러그인 생성 시
- [ ] 디렉토리 구조 생성 (`plugins/{domain}/{plugin-name}/`)
- [ ] `.claude-plugin/plugin.json` 생성
- [ ] 마켓플레이스에 등록 (`.claude-plugin/marketplace.json`)
- [ ] README.md 생성
- [ ] CHANGELOG.md 생성
- [ ] 컴포넌트 추가 (commands/, skills/)

### 플러그인 업데이트 시
- [ ] 브랜치 생성
- [ ] 코드 수정
- [ ] 버전 업데이트 (`plugin.json`, `marketplace.json`)
- [ ] CHANGELOG.md 업데이트
- [ ] 커밋 및 푸시
- [ ] PR 생성 (PR Template 항목 작성)
