---
name: gh-pr-create
description: >
  GitHub Draft PR 생성 스킬. push 전에 lint/포맷 게이트, 커밋 메시지 컨벤션,
  테스트 안전성 확인 같은 pre-flight 체크를 먼저 돌린 뒤 draft PR을 생성한다.
  Use when "PR 생성", "PR 올려줘", "draft PR", "gh pr create", "/ship",
  "풀리퀘스트 만들어줘", "create PR", "open PR", "PR 열어줘",
  "PR 만들어", "push하고 PR 올려줘", "코드 올려줘", "ship it".
  단순 draft PR 생성부터 린트/커밋포맷/테스트 안전성까지 한 번에 게이트.
---

# GitHub Draft PR Creator (with pre-flight gates)

브랜치를 push하고 **항상 draft PR**로 생성한다. push 전에 프로젝트가 강제하는 게이트를
자동으로 돌려서 CI에서 "포맷 실패"나 "커밋 메시지 rejected"로 재push하는 일을 없앤다.

왜 pre-flight을 스킬 안에 박아두는가: 메모리나 수동 체크에 의존하면 "lint 돌리는 걸 깜빡해서
push → CI 실패 → 다시 push" 루프가 반복된다. 과거에도 이 루프가 여러 번 있었고, CI 재실행
비용뿐 아니라 리뷰어에게 "다시 봐주세요"를 전달하는 심리 비용이 크다. 게이트를 스킬이
책임지면 이 루프가 원천 차단된다.

## 핵심 원칙

- **반드시 draft PR로 생성** (`--draft` 플래그 필수)
- **본인을 assignee로 할당** (`--assignee @me` 필수)
- **pre-flight 게이트가 하나라도 실패하면 push 금지**
- PR 템플릿이 있으면 해당 형식을 따름, 없으면 기본 best practice 템플릿

## Workflow

```
Step 0: Pre-flight Gates (branch / lint / commit format / test safety)
Step 1: 사전 확인 (변경사항, 템플릿 감지)
Step 2: Push to remote
Step 3: PR 본문 작성
Step 4: Draft PR 생성
```

---

## Step 0: Pre-flight Gates

변경사항이 있는 상태에서 push 직전에 네 가지 게이트를 순차 실행한다. 하나라도 실패하면
**그 자리에서 STOP**하고 사용자에게 수정 방법을 안내한다.

각 게이트는 실패 시 "왜 막혔는지 + 어떻게 해결하는지"를 함께 출력한다. Claude가 사용자에게
"실패했어요"만 보고하고 손 놓는 일을 방지하기 위함.

### 0-A. Branch Guard

main/master/develop에 직접 PR은 금지. 이 체크가 먼저 나와야 이후 게이트를 돌린 작업이
무의미해지지 않는다.

```bash
current=$(git branch --show-current)
case "$current" in
  main|master|develop)
    echo "ERROR: '$current' 브랜치에서 PR 생성 금지. feature 브랜치에서 다시 실행하세요."
    exit 1
    ;;
esac
```

### 0-B. Lint / Format Gate (Python 프로젝트 감지 시)

프로젝트 루트에 `pyproject.toml`이나 `setup.py`가 있고 변경된 파일 중 `.py`가 있으면
black + isort을 `--check` 모드로 돌린다. 수정은 하지 않는다 — 사용자가 직접 수정해야
의도한 변경만 반영된다.

```bash
# 변경된 Python 파일 목록 (staged + unstaged + base branch 비교 포함)
base_branch=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
base_branch=${base_branch:-develop}
changed_py=$(git diff --name-only --diff-filter=ACMR "origin/$base_branch...HEAD" -- '*.py'; \
             git diff --name-only --diff-filter=ACMR --cached -- '*.py'; \
             git diff --name-only --diff-filter=ACMR -- '*.py')
changed_py=$(echo "$changed_py" | sort -u | grep -v '^$')

if [ -n "$changed_py" ] && ([ -f pyproject.toml ] || [ -f setup.py ]); then
  # black이 설치되어 있는지 확인
  if command -v black >/dev/null 2>&1; then
    echo "$changed_py" | xargs black --check --quiet || {
      echo "❌ black 포맷 실패. 다음 명령으로 수정하세요:"
      echo "   echo '$changed_py' | xargs black"
      exit 1
    }
  fi
  if command -v isort >/dev/null 2>&1; then
    echo "$changed_py" | xargs isort --profile black --check-only --quiet || {
      echo "❌ isort 정렬 실패. 다음 명령으로 수정하세요:"
      echo "   echo '$changed_py' | xargs isort --profile black"
      exit 1
    }
  fi
fi
```

black/isort이 설치돼 있지 않은 환경에서는 이 게이트를 건너뛴다 (경고만 출력). 설치를 강제하지
않는 이유: 다른 언어 프로젝트에서 이 스킬을 쓸 수 있어야 하고, 게이트가 "도구 부재" 때문에
잘못 막히는 것보다 "포맷 실패"가 CI에서 잡히는 편이 덜 번거롭다. 단, 스킬은 명시적으로
"black 없어서 skip함" 메시지를 남겨야 한다.

### 0-C. Commit Format Gate (프로젝트 컨벤션 감지 시)

프로젝트 루트의 `CLAUDE.md` 또는 `.dev/rules/commit-format.md`에 커밋 메시지 포맷이
명시돼 있으면 그 정규식을 추출하여 이번 브랜치의 모든 커밋을 검증한다.

감지 우선순위:
1. `CLAUDE.md`에 "커밋 규칙" / "Commit Format" / "commit message format" 섹션이 있으면 패턴 추출
2. `.dev/rules/commit-*.md` 파일이 있으면 패턴 추출
3. 없으면 게이트 스킵 (모든 프로젝트에 강제할 수 없음)

패턴 추출이 애매하면 사용자에게 AskUserQuestion으로 확인받는다. 절대 자의적으로
"대충 이런 패턴인 것 같다"로 넘어가지 않는다.

**예시 (clue-api):**
`CLAUDE.md`의 "커밋 메시지 포맷" 섹션에 다음이 있음:
```
{Notion task Id}.{행위}{(적용범위)}-{설명}
```
→ 정규식: `^[A-Z]+-[0-9]+\.(add|update|fix|refactor|feat|docs|style|package)(\([^)]+\))?[_\s-]`

```bash
# 브랜치의 모든 커밋 메시지 추출
base=$(git merge-base HEAD "origin/$base_branch")
bad_commits=$(git log --format='%H %s' "$base..HEAD" | \
  grep -vE '^[a-f0-9]+ [A-Z]+-[0-9]+\.(add|update|fix|refactor|feat|docs|style|package|chore)' || true)

if [ -n "$bad_commits" ]; then
  echo "❌ 커밋 메시지 포맷 위반:"
  echo "$bad_commits"
  echo ""
  echo "프로젝트 규칙: {TASK-ID}.{행위}_{설명}  (예: DPT-1234.fix_로그인 오류 수정)"
  echo "git rebase -i origin/$base_branch 로 수정하세요."
  exit 1
fi
```

정규식은 프로젝트마다 다르므로 반드시 CLAUDE.md에서 직접 추출한다. 이 예시의 DPT 패턴을
다른 프로젝트에 그대로 적용하지 말 것.

### 0-D. Test Safety Hint (DB config 감지 시)

프로젝트에 `*.cfg`나 `*.toml`에 DB 호스트 설정이 있고, 현재 설정값이 localhost/127.0.0.1/
testdb가 아니면 **경고만** 출력한다 (이 스킬은 테스트를 실행하지 않으므로 차단까지는 하지 않는다).

사용자가 push 전에 별도로 테스트를 돌릴 계획이라면 미리 알려주는 안전망이다.

```bash
# clue-api 스타일 config 감지
if [ -f main/clue_api.cfg ]; then
  host=$(grep -E '^PSQL_HOST\s*=' main/clue_api.cfg | head -1 | awk -F '=' '{print $2}' | tr -d ' "'"'"'')
  case "$host" in
    localhost|127.0.0.1|testdb|"") ;;  # 안전
    *)
      echo "⚠️  경고: main/clue_api.cfg의 PSQL_HOST가 '$host'입니다."
      echo "   push 전 pytest를 실행할 계획이라면 반드시 localhost로 변경하세요."
      echo "   (2026-04-02 dev DB 데이터 삭제 사고 이력 있음)"
      ;;
  esac
fi
```

이 게이트는 **경고만** — push를 막지는 않는다. 사용자가 테스트를 돌릴 계획이 없을 수도 있고,
불필요한 friction을 피하기 위함. 단, 사용자가 명시적으로 "PR 만들기 전에 pytest 돌려줘"라고
요청했으면 이 경고가 에러로 승격된다.

### Pre-flight 요약 출력

네 게이트가 모두 통과하면 간단한 요약을 출력하고 Step 1로 진행:

```
Pre-flight Gates
  ✅ Branch: feature/DPT-11042-jwt-fix (base: develop)
  ✅ Lint: black/isort passed (3 files)
  ✅ Commit format: 2 commits passed
  ✅ DB config: safe (PSQL_HOST=localhost)

Proceeding to push...
```

건너뛴 게이트도 명시한다:
```
  ⊘ Lint: skipped (black/isort not installed)
  ⊘ Commit format: skipped (no convention detected in CLAUDE.md)
```

---

## Step 1: 사전 확인

```bash
# 현재 브랜치 확인
git branch --show-current

# 변경사항 확인
git log "origin/$base_branch..HEAD" --oneline
git diff "origin/$base_branch...HEAD" --stat

# PR 템플릿 존재 여부 확인
ls .github/pull_request_template.md 2>/dev/null
ls .github/PULL_REQUEST_TEMPLATE.md 2>/dev/null
ls .github/PULL_REQUEST_TEMPLATE/ 2>/dev/null
```

**base 브랜치 결정:**
- 프로젝트에 `develop` 브랜치가 있으면 `--base develop`
- 없으면 `--base main` 또는 `--base master`
- 사용자가 명시적으로 지정하면 해당 브랜치 사용

## Step 2: Push to remote

```bash
git push -u origin $(git branch --show-current)
```

## Step 3: PR 본문 작성

### 템플릿이 있는 경우

`.github/pull_request_template.md` 파일을 읽고, 해당 형식의 각 섹션을 현재 변경사항에
맞게 채워서 PR 본문을 작성.

### 템플릿이 없는 경우

**반드시 아래 기본 템플릿을 사용한다.** 자체 형식(## Summary, ## Changes 등)으로
대체하지 않는다. 각 섹션을 현재 변경사항에 맞게 채워서 작성:

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

**Pre-flight 요약 자동 삽입:** PR 본문의 체크리스트 섹션 바로 아래에 pre-flight 결과를
자동으로 붙인다. 리뷰어가 "이 사람이 최소한 게이트는 통과했구나"를 한 줄로 확인할 수 있다.

```markdown
---
Pre-flight: black ✅ isort ✅ 커밋포맷 ✅ DB config ✅
```

## Step 4: Draft PR 생성

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

사용자가 `task_id`를 제공했거나 이전 Phase에서 저장한 `task_id`가 있으면, 티켓 링크 섹션에
해당 ID를 기입. 이미 커밋 포맷 게이트에서 task_id가 강제되므로, 첫 커밋 메시지에서
추출해서 자동 기입할 수도 있다.

## 주의사항

- `--draft` 플래그를 **절대 생략하지 않는다**
- `--assignee @me`를 **절대 생략하지 않는다**
- PR 제목은 70자 미만으로 간결하게
- 커밋 히스토리와 diff를 분석하여 의미 있는 PR 본문 작성
- 민감 정보(API 키, 비밀번호 등)가 커밋에 포함되어 있지 않은지 확인
- **Pre-flight 게이트를 건너뛰지 않는다** — "급해서 일단 push"는 과거의 재push 루프로
  돌아가는 지름길

## Failure Modes — 이렇게 막혔을 때

| 게이트 | 실패 메시지 | 해결 |
|---|---|---|
| Branch | "'develop' 브랜치에서 PR 생성 금지" | `git checkout -b feature/TASK-설명` |
| Lint | "black 포맷 실패" | `xargs black` → `git add` → 재커밋 |
| Lint | "isort 정렬 실패" | `xargs isort --profile black` → 재커밋 |
| Commit format | "{hash} 커밋이 규칙 위반" | `git rebase -i origin/develop` |
| DB config | 경고만 출력 | PR 생성은 진행. 테스트 돌릴 때만 주의 |

"게이트를 우회해서 빨리 push하는 법"은 의도적으로 문서화하지 않는다. 우회가 필요하면
사용자가 스킬을 안 쓰고 직접 `gh pr create`을 치면 된다.
