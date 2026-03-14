---
name: gh-pr-create
description: >
  GitHub Draft PR 생성 스킬.
  Use when "PR 생성", "PR 올려줘", "draft PR", "gh pr create",
  "풀리퀘스트 만들어줘", "create PR", "open PR", "PR 열어줘",
  "PR 만들어", "push하고 PR 올려줘", "코드 올려줘".
  브랜치 push 후 draft PR을 생성하며, 프로젝트의 PR 템플릿을 자동 감지하여 적용.
---

# GitHub Draft PR Creator

브랜치를 push하고 **항상 draft PR**로 생성. 프로젝트 PR 템플릿을 자동 감지하여 적용.

## 핵심 원칙

- **반드시 draft PR로 생성** (`--draft` 플래그 필수)
- **본인을 assignee로 할당** (`--assignee @me` 필수)
- PR 템플릿이 있으면 해당 형식을 따름
- 없으면 기본 best practice 템플릿 사용

## Workflow

```
Step 1: 사전 확인 (브랜치, 변경사항, 템플릿 감지)
Step 2: Push to remote
Step 3: PR 본문 작성
Step 4: Draft PR 생성
```

### Step 1: 사전 확인

```bash
# 현재 브랜치 확인 (main/master/develop 직접 PR 금지)
git branch --show-current

# 변경사항 확인
git log $(git merge-base HEAD develop)..HEAD --oneline
git diff develop...HEAD --stat

# PR 템플릿 존재 여부 확인
ls .github/pull_request_template.md 2>/dev/null
ls .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null
ls .github/PULL_REQUEST_TEMPLATE/ 2>/dev/null
```

**base 브랜치 결정:**
- 프로젝트에 `develop` 브랜치가 있으면 `--base develop`
- 없으면 `--base main` 또는 `--base master`
- 사용자가 명시적으로 지정하면 해당 브랜치 사용

### Step 2: Push to remote

```bash
git push -u origin $(git branch --show-current)
```

### Step 3: PR 본문 작성

#### 템플릿이 있는 경우

`.github/pull_request_template.md` 파일을 읽고, 해당 형식의 각 섹션을 현재 변경사항에 맞게 채워서 PR 본문을 작성.

#### 템플릿이 없는 경우

**반드시 아래 기본 템플릿을 사용한다.** 자체 형식(## Summary, ## Changes 등)으로 대체하지 않는다.
각 섹션을 현재 변경사항에 맞게 채워서 작성:

```markdown
# 🔗 티켓 링크
[task_id 또는 관련 이슈 링크]

# 📋 작업 내용
[구현한 기능 요약]

- [주요 변경사항 1]
- [주요 변경사항 2]

## 🧐 주요 검토 필요 사항
- [리뷰어가 집중해서 봐야 할 부분]

## 📌 검토하지 않아도 되는 사항 (optional)

## 🚀 추후에 개선할 사항 (백로그 링크)(optional)

## 📸 스크린샷 (optional)

# ✅ 체크리스트

- [ ] 나는 코드 셀프 리뷰를 하였다.
- [ ] 나는 수정사항에 대해 철저하게 테스트 하였다.
- [ ] 코드 변경 사이즈가 적절하다 생각한다. (500줄 미만. 단순 삭제는 OK)
```

### Step 4: Draft PR 생성

```bash
gh pr create \
  --base <base-branch> \
  --title "<커밋 히스토리 기반 간결한 제목>" \
  --body "$(cat <<'EOF'
<Step 3에서 작성한 본문>
EOF
)" \
  --draft \
  --assignee @me
```

**생성 후 PR URL을 사용자에게 출력.**

## task_id 연동

사용자가 `task_id`를 제공했거나 이전 Phase에서 저장한 `task_id`가 있으면, 티켓 링크 섹션에 해당 ID를 기입.

## 주의사항

- `--draft` 플래그를 **절대 생략하지 않는다**
- `--assignee @me`를 **절대 생략하지 않는다**
- PR 제목은 70자 미만으로 간결하게
- 커밋 히스토리와 diff를 분석하여 의미 있는 PR 본문 작성
- 민감 정보(API 키, 비밀번호 등)가 커밋에 포함되어 있지 않은지 확인
