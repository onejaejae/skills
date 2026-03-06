---
name: gh-draft-pr-create
description: >
  Use when "PR 생성", "PR 올려줘", "draft PR", "gh pr create",
  "풀리퀘스트 만들어줘", "create PR", "open PR", "PR 열어줘",
  "PR 만들어", "push하고 PR 올려줘", "코드 올려줘".
---

# GitHub Draft PR Creator

브랜치를 push하고 **항상 draft PR**로 생성. 프로젝트 PR 템플릿을 자동 감지하여 적용.

## 필수 플래그 (절대 생략 금지)

- `--draft` : 반드시 draft PR로 생성
- `--assignee @me` : 반드시 본인을 assignee로 할당
- `--base develop` : 반드시 develop을 base로 지정

## Workflow

### Step 1: 사전 확인

```bash
# 현재 브랜치 확인 (main/master/develop이면 중단)
git branch --show-current

# 변경사항 확인
git log $(git merge-base HEAD develop)..HEAD --oneline
git diff develop...HEAD --stat

# PR 템플릿 확인
cat .github/pull_request_template.md
```

### Step 2: Push to remote

```bash
git push -u origin $(git branch --show-current)
```

### Step 3: PR 본문 작성

#### 템플릿이 있는 경우

**반드시 `.github/pull_request_template.md`의 형식을 그대로 따른다.**

- 헤딩 레벨 변경 금지 (`#`을 `##`로 바꾸지 않는다)
- 섹션 추가/제거 금지 (optional 섹션도 유지, 내용 없으면 비워둔다)
- `### 주요 변경사항` 같은 자의적 subsection 추가 금지

#### 템플릿이 없는 경우

**반드시 아래 기본 템플릿을 사용한다.** 자체 형식(## Summary, ## Changes 등)으로 대체하지 않는다.

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

**task_id 추출**: 브랜치명에서 `DPT-XXXXX` 부분을 추출하여 티켓 링크에 기입.

```
브랜치명: DPT-10819.update_data-validation-keyword-patch
         ^^^^^^^^^ task_id
```

**체크리스트**: 셀프 리뷰와 테스트를 실제로 수행했으면 `[x]`로 체크.

### Step 4: Draft PR 생성

```bash
gh pr create \
  --base develop \
  --title "<커밋 히스토리 기반 간결한 제목 (70자 미만)>" \
  --body "$(cat <<'EOF'
<Step 3에서 작성한 본문>
EOF
)" \
  --draft \
  --assignee @me
```

**생성 후 PR URL을 사용자에게 출력.**

## 주의사항

- `--draft` 플래그를 **절대 생략하지 않는다**
- `--assignee @me`를 **절대 생략하지 않는다**
- `--base develop`을 **절대 생략하지 않는다**
- PR 제목은 70자 미만으로 간결하게
- 민감 정보(API 키, 비밀번호 등)가 커밋에 포함되어 있지 않은지 확인
