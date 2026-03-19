---
name: notion-task-creator
description: >
  Notion 태스크 Database에 태스크를 생성하는 스킬.
  Use when "태스크 생성", "task 생성", "notion task", "노션 태스크", "할 일 추가",
  "create task", "add task to notion", "태스크 만들어줘", "작업 추가".
  Task 생성에만 특화된 경량 스킬로, 제목/상태/작업분야/작업유형/에픽/DoD/본문 내용을 지원.
---

# Notion Task Creator

태스크 Database(`a04b41f4f46e49d285cf04ce952db946`)에 태스크를 생성.

## 필수 규칙

- **반드시 `create-task.sh` 스크립트를 사용할 것.** Notion API 직접 curl 호출 금지.
- 스크립트 경로: `~/.claude/skills/notion-task-creator/scripts/create-task.sh`
- env.sh가 자동 로드됨. 별도 source 불필요.

## 사용법

### 기본 (제목만)

```bash
~/.claude/skills/notion-task-creator/scripts/create-task.sh --title "로그인 기능 구현"
```

### 전체 옵션

```bash
~/.claude/skills/notion-task-creator/scripts/create-task.sh \
  --title "로그인 기능 구현" \
  --status "TODO" \
  --area "Backend" \
  --type "신규 기능" \
  --epic "2a0d87e5-17f4-802b-9b12-c1e1bc08b7b8" \
  --dod "로그인 API 구현 및 테스트 완료" \
  --body "## 배경\n로그인 기능이 필요합니다.\n## 요구사항\n- JWT 기반 인증\n- 비밀번호 암호화"
```

## 옵션

| 옵션 | 필수 | 기본값 | 설명 |
|------|------|--------|------|
| `--title` | O | - | 태스크 제목 |
| `--status` | X | `TODO` | 상태: `TODO`, `In Progress`, `Done` |
| `--area` | X | `Backend` | 작업 분야: `Backend`, `Frontend`, `Infra`, `기획` |
| `--type` | X | `신규 기능` | 작업 유형 (쉼표 구분 multi_select) |
| `--epic` | X | env `NOTION_EPIC_ID` | 에픽 relation ID |
| `--dod` | X | - | Definition of Done |
| `--date` | X | 오늘 (`yyyy-mm-dd`) | 기간 시작일 |
| `--assignee` | X | `enzo.cho(조원제)` | 담당자 Notion user ID |
| `--no-assignee` | X | - | 담당자 미지정 |
| `--body` | X | - | 본문 마크다운 (`\n`으로 줄바꿈, `##`=h2, `###`=h3, `-`=bullet) |
| `--icon` | X | `checkmark-square_gray` | 아이콘 URL suffix |

## 작업 유형 예시

단일: `--type "신규 기능"`
복수: `--type "리팩토링,버그 수정"`

## 출력

```
Task ID: DPT-10310
Page ID: abc-123-def
Title: 로그인 기능 구현
Status: TODO
```

## 워크플로우

1. 사용자 요청에서 제목/상태/분야/유형/DoD/본문 추출
2. `create-task.sh` 스크립트 실행
3. 출력된 Task ID, Page ID 사용자에게 보고

### 여러 태스크 일괄 생성

스크립트를 반복 호출:

```bash
~/.claude/skills/notion-task-creator/scripts/create-task.sh --title "사용자 목록 조회 API" --type "신규 기능" --dod "GET /api/v1/users 구현 완료"
~/.claude/skills/notion-task-creator/scripts/create-task.sh --title "사용자 상세 조회 API" --type "신규 기능" --dod "GET /api/v1/users/:id 구현 완료"
```

## 환경 설정

스크립트가 `scripts/env.sh`를 자동 로드. 없으면 환경변수 직접 설정:

```bash
export NOTION_API_KEY="secret_xxx"
export NOTION_TASKS_DATABASE_ID="a04b41f4f46e49d285cf04ce952db946"
export NOTION_EPIC_ID="에픽-페이지-ID"  # 선택
```

## 트러블슈팅

### `NOTION_API_KEY가 설정되지 않았습니다` 에러

env.sh 자동 로드 실패. **절대 `source env.sh`를 수동으로 실행하지 말 것.**

해결 순서:
1. `~/.claude/skills/notion-task-creator/scripts/env.sh` 파일 존재 여부 확인
2. 파일이 없으면 생성하거나 올바른 위치에 복사
3. 파일이 있으면 NOTION_API_KEY가 올바르게 설정되어 있는지 확인
4. 위 모두 확인 후에도 실패하면 환경변수 직접 export (최후의 수단)
