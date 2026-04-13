---
name: jira-ops
description: |
  Use when "/jira:ops", "지라 오퍼레이션", "지라 전체 파이프라인", "jira ops",
  "jira pipeline", "티켓 처리", "티켓 전체 프로세스",
  "이 티켓 분석부터 서브태스크까지", "리서치부터 디스패치까지".
---

# /jira:ops — Jira Ticket-to-Subtask Pipeline

Jira 티켓 키를 받아 4단계 파이프라인을 순차 실행한다.

```
Stage 1: /jira:recon {KEY}     → specs/{KEY}-research.md
Stage 2: /jira:assess {KEY}    → specs/{KEY}-scope.md
Stage 3: /deep-interview        → Open Questions 해소
Stage 4: /jira:dispatch {KEY}  → Jira 서브태스크 생성
```

## Stage 0: Parse & Route

### 0-A. 티켓 키 추출
입력에서 Jira 키를 파싱한다.
- URL → `DPHRS-8`
- Bare key → `DPHRS-8`
- 파싱 실패 → STOP

### 0-B. 시작점 결정
기존 산출물을 확인하여 시작 Stage를 자동 결정한다.

```
if specs/{KEY}-scope.md exists AND specs/{KEY}-research.md exists:
  check staleness (아래 참조)
  → "Stage 2 산출물이 존재합니다. Stage 3 (deep-interview)부터 시작할까요?"
elif specs/{KEY}-research.md exists:
  check staleness (아래 참조)
  → "Stage 1 산출물이 존재합니다. Stage 2 (assess)부터 시작할까요?"
elif specs/{KEY}-scope.md exists BUT specs/{KEY}-research.md missing:
  → "scope.md는 있지만 research.md가 없습니다. Stage 1부터 새로 시작합니다."
  → Stage 1부터 시작 (scope.md는 research 없이 무효)
else:
  → Stage 1부터 시작
```
**의존성 규칙**: scope.md는 research.md에 의존한다. research.md 없이 scope.md만 있으면 무효.
사용자가 "Stage 2부터"를 요청해도 research.md가 없으면 거부하고 Stage 1로 안내.

**산출물 Staleness 검사**: 기존 산출물의 수정일이 **7일 이상 경과**했으면 경고를 출력한다:
```
⚠️ specs/{KEY}-research.md는 {N}일 전에 생성되었습니다.
티켓 요구사항이나 서브태스크가 변경되었을 수 있습니다.
1. **재생성** — Stage 1부터 새로 시작
2. **그대로 사용** — 기존 산출물 기반으로 진행
```
수정일 확인: `stat -f "%Sm" -t "%Y-%m-%d" ~/.claude/specs/{KEY}-research.md` (macOS) 또는 파일 메타데이터에서 확인.

AskUserQuestion으로 확인:
1. **제안된 Stage부터 시작** (기본)
2. **Stage 1부터 새로 시작** (산출물 재생성)
3. **특정 Stage 지정** (예: "3번부터")

### 0-C. 프로젝트 경로 확인 (Stage 2에서 필요, 교차 검증 필수)

**단순히 cwd에 소스 코드가 있는지만 확인하면 안 된다.** 티켓의 대상 프로젝트와 cwd가 다를 수 있다.

1. **티켓 제목/설명에서 프로젝트 힌트 추출**: `[통합홈]` → with-api, `[연구검색]` → clue-api 등
2. **cwd 프로젝트 정체성 확인**: CLAUDE.md, pyproject.toml, 디렉토리명
3. **교차 검증**: 힌트와 cwd가 불일치하면 → AskUserQuestion으로 올바른 경로 확인
4. 일치하면 → cwd 자동 사용

**Why**: DPHRS-8 E2E에서 티켓은 with-api 대상이었으나 cwd가 clue-api여서 잘못된 프로젝트 분석. 서브태스크 전체가 무효화됨.

### 0-D. 상태 출력

```
## jira:ops — {KEY}

Pipeline: recon → assess → interview → dispatch
Starting from: Stage {N}
Project: {project_root}
```

## Stage 1: Research (/jira:recon)

```
Skill("jira-recon", args="{KEY}")
```

jira:recon이 자율 실행되어 `specs/{KEY}-research.md`를 생성한다.

### 완료 후 전환
```
Stage 1 complete. Research report saved.
Confidence: {level}
Proceeding to Stage 2 (assess)...
```

바로 Stage 2로 진행한다. 사용자 확인 불필요 (자율 파이프라인).

**연쇄 품질 저하 방어 — Confidence Gate:**
- **HIGH**: 자동 진행
- **MED**: 경고 출력 후 자동 진행
  ```
  Research Confidence is MED ({N} sources failed). Scope analysis may be partially incomplete.
  ```
- **LOW**: 사용자 확인 필수 (AskUserQuestion)
  ```
  Research Confidence is LOW ({N}+ sources failed).
  1. **Continue** — 불완전한 리서치로 진행 (scope 품질 저하 가능)
  2. **Retry** — /jira:recon 재실행
  3. **Stop** — 파이프라인 중단
  ```
  LOW Confidence로 진행하면 이후 모든 Stage에 `[LOW CONFIDENCE WARNING]` 태그 부착.

## Stage 2: Scope Analysis (/jira:assess)

```
Skill("jira-assess", args="{KEY}")
```

jira:assess가 6-agent 병렬 분석을 수행하여 `specs/{KEY}-scope.md`를 생성한다.

### 완료 후 전환

scope 리포트의 Section 7 (Open Questions)를 확인한다.

```
Stage 2 complete. Scope report saved.
Confidence: {level}
Open Questions: {count}
```

**Open Questions가 0개이면:**
- Stage 3 (deep-interview) 스킵
- "Open Questions가 없습니다. Stage 4 (dispatch)로 진행합니다."

**Open Questions가 1개 이상이면:**
- 먼저 Open Questions를 분류:
  - **코드 분석으로 해소 가능한 항목이 1개 이상** → Stage 3 진행 권장
  - **전부 PO/PD 판단 필요** (코드 분석 해소 가능 항목 0개) → Stage 3 스킵 권장 (deep-interview로 해소 불가)
  - **혼합** (일부 코드 분석, 일부 PO/PD) → Stage 3 진행 권장 (코드 분석 가능한 것만이라도 해소)
- AskUserQuestion:
  1. **Stage 3 진행** — deep-interview로 모호함 해소
  2. **Stage 3 스킵** — 현재 상태로 dispatch 진행
  3. **파이프라인 중단** — 여기서 멈추고 수동으로 검토

**Stage 3 스킵 시**: scope.md Section 7에 스킵 사유 기록. 예: "Stage 3 Skipped: 5개 Open Questions 모두 PO/PD 판단 필요 (코드 분석으로 해소 불가)"

**Why**: DPHRS-8 2차 E2E에서 Open Questions가 모두 PO/PD 판단 필요였으나, 스킵 사유가 기록되지 않아 나중에 왜 스킵했는지 추적 불가.

## Stage 3: Clarification (/deep-interview)

scope 리포트의 Open Questions를 해소한다.

**Context 주입 방법**: Skill 호출 전에 오케스트레이터가 scope.md의 Section 6, 7을 Read로 읽어 대화 context에 포함시킨 후, deep-interview 스킬을 호출한다. deep-interview가 자연스럽게 이 context를 참조할 수 있다.

```
# 1. scope.md Section 6, 7을 Read로 대화에 주입
Read("~/.claude/specs/{KEY}-scope.md")

# 2. deep-interview 호출 (context가 이미 대화에 있으므로 args 불필요)
Skill(skill="deep-interview")
```

deep-interview에서 참조할 context:
- scope 리포트의 Open Questions (Section 7)
- Task Candidates (Section 6)
- 요구사항 요약

### 완료 후 전환
deep-interview가 완료되면 (ambiguity ≤ 0.2):
```
Stage 3 complete. Open Questions resolved.
Reviewing Section 6 for reconstruction...
```

### Section 6 재구성 검토 (Stage 3 → Stage 4 핸드오프)

deep-interview의 결정이 **태스크 정의 자체를 바꾸는 경우**, Stage 4(dispatch)로 넘어가기 전에 `specs/{KEY}-scope.md`의 Section 6을 업데이트해야 한다. assess 단계의 Section 6은 scope.md가 쓰여진 시점의 가정을 반영하며, 인터뷰 결정은 그 가정을 뒤엎을 수 있다.

**재구성이 필요한 결정 유형** (인터뷰 답변에서 다음 중 하나라도 바뀌면):
1. **산출물 형식 변경**: 코드 → 문서, 문서 → Jira 서브태스크, 마크다운 파일 → 기존 티켓 description, 등
2. **태스크 구조 변경**: 단일 태스크 → 복수 태스크 분리, 복수 → 병합, 조사 vs 권고 분리
3. **범위 변경**: 스코프 확장/축소 (예: BE만 → BE+FE, 전체 → MVP)
4. **DoD 강화/완화**: 새로운 검증 항목 추가, 기존 항목 제거
5. **의존성 재정의**: 태스크 간 선후 관계 변경, 전제조건 추가
6. **우선순위 재조정**: HIGH/MED/LOW 재평가

**재구성이 불필요한 경우**:
- 인터뷰가 기존 Section 6을 **확인만** 하고 끝난 경우 (DECIDE_LATER 항목만 정리)
- 인터뷰 답변이 DoD의 세부 문구만 다듬는 수준인 경우
- Open Questions가 Section 7 항목만 해소하고 Section 6은 건드리지 않는 경우

**재구성 절차**:

1. **인터뷰 결정 추출**: deep-interview의 Final Ambiguity Snapshot과 라운드별 사용자 답변에서 태스크 정의에 영향을 주는 결정 목록화
2. **영향 매핑**: 각 결정이 기존 Section 6의 어느 행을 바꾸는지 식별 (태스크 번호, 필드)
3. **Section 6 Edit**: `Edit` 도구로 scope.md Section 6 테이블 재작성. 전체 파일 재생성 금지 — Section 6 블록만 교체
4. **기록**: 재구성 이유를 scope.md 하단 또는 Section 8 (Agent Coverage Notes)에 명시:
   ```
   Section 6 reconstructed after /deep-interview (rounds N, M decisions):
   - Output format: {original} → {new}
   - Structure: {original} → {new}
   ```
5. **사용자 확인 (선택)**: 재구성이 5개 이상의 태스크를 바꾸거나 구조를 크게 변경하면 AskUserQuestion으로 재구성안 확인 후 Edit. 2-3개 수준의 작은 변경은 자동 적용 후 Stage 4에서 dispatch Preview를 통해 확인받음.

**Section 6 재구성 후**:
```
Section 6 reconstructed: {N} tasks updated ({reasons})
Proceeding to Stage 4 (dispatch)...
```

**Why**: DPHRS-29 E2E에서 assess 직후 Section 6은 "마크다운 문서 산출물" 기준이었으나, 인터뷰 중 사용자가 "jira 하위 작업에 추가하는 것이 좋아"로 산출물 형식을 뒤엎었다. Section 6을 수동 Edit하지 않았으면 dispatch가 마크다운 deliverable 구조로 서브태스크를 생성했을 것. 이 절차가 문서화되지 않아 매번 애드혹 판단이 필요했다.

### 멀티 프로젝트 티켓 처리

티켓이 여러 프로젝트에 걸쳐 있는 경우 (예: FE=clue-client/with-client, BE=with-api):
- assess는 **한 번에 하나의 프로젝트**만 분석. 가장 핵심적인 BE 프로젝트를 우선 분석.
- FE 프로젝트는 별도 assess 실행이 필요하면 사용자에게 안내: "FE 프로젝트도 분석할까요?"
- dispatch에서 생성되는 서브태스크는 **분석된 프로젝트(BE) 범위의 태스크만** 포함. FE 태스크가 이미 수동으로 존재하면(예: DPHRS-42~44, 71) 중복 생성하지 않음.

### Open Questions 미결 상태의 dispatch 실행

Stage 3 스킵 후 dispatch를 실행할 때, scope.md의 Open Questions가 **태스크 정의에 직접 영향**을 주는 경우:
- dispatch Preview에 경고 추가: "⚠️ {N}개 Open Questions 미결 상태. 서브태스크 품질이 제한될 수 있습니다."
- 각 태스크의 DoD에 관련 Open Question 참조 추가 (해당 시)
- **dispatch를 차단하지는 않음** — 사용자가 Create All을 선택하면 진행

## Stage 4: Dispatch (/jira:dispatch)

```
Skill("jira-dispatch", args="{KEY}")
```

jira:dispatch가 Section 6의 Task Candidates를 파싱하여:
1. Preview 출력
2. 사용자 확인 (Create All / Edit / Cancel)
3. 서브태스크 생성

### 완료 후: Jira 코멘트 게시

dispatch 완료 후, 부모 티켓에 **scope 분석 결과를 Jira Wiki Markup 코멘트로 추가**한다.

**Auth 획득**: dispatch 스킬과 동일한 방식으로 ops가 직접 인증을 수행한다:
1. `cat ~/.config/.jira/.config.yml`에서 `server`, `login` 추출
2. `echo -n "{login}:${JIRA_API_TOKEN}" | base64`로 auth_token 생성
3. `/rest/api/2/myself`로 인증 테스트

```bash
curl -s -X POST "https://{server}/rest/api/2/issue/{KEY}/comment" \
  -H "Authorization: Basic {auth_token}" \
  -H "Content-Type: application/json" \
  -d '{"body": "{wiki_markup_comment}"}'
```

**주의**: server URL의 trailing slash 제거 필수. `server.rstrip('/')` 처리.

**코멘트 Wiki Markup 템플릿**:
```
h2. Scope Analysis Summary — {KEY}

h3. ASIS 핵심 발견
{scope.md Section 1에서 레이어별 1줄 요약, 최대 5줄}

h3. 생성된 서브태스크
|| # || Key || Title || Priority || Effort ||
| 1 | {DPHRS-84} | {title} | High | 5h |
| 2 | {DPHRS-85} | {title} | Medium | 3h |

h3. 미결 사항
{scope.md Section 7의 Open Questions. 0개면 "없음"}

----
_Generated by /jira:ops pipeline_
```

**코멘트 길이 제한**: Jira 코멘트는 32,767자 제한. scope.md 전체를 복사하지 않고, 위 템플릿의 요약본만 게시한다.

**Why**: DPHRS-8 2차 E2E에서 파이프라인 산출물이 로컬 파일에만 있고 Jira에 게시되지 않아 팀원이 결과를 확인할 수 없었음.

### 파이프라인 완료 출력

```
## jira:ops Complete — {KEY}

### Pipeline Summary
| Stage | Skill | Result |
|-------|-------|--------|
| 1 | jira:recon | specs/{KEY}-research.md (Confidence: {level}) |
| 2 | jira:assess | specs/{KEY}-scope.md (Confidence: {level}) |
| 3 | deep-interview | {Completed/Skipped: 사유} |
| 4 | jira:dispatch | {N} subtasks created |
| 5 | Jira comment | Posted to {KEY} |

### Artifacts
- Research: ~/.claude/specs/{KEY}-research.md
- Scope: ~/.claude/specs/{KEY}-scope.md
- Subtasks: {list of created keys}
- Jira comment: Posted
```

## Hard Rules

1. **순차 실행** — Stage 1 → 2 → 3 → 4 순서. 건너뛰기는 가능하지만 역순 불가.
2. **파일 기반 핸드오프** — 각 스킬은 `specs/{KEY}-*.md`에 산출물을 저장하고, 다음 스킬이 이를 읽는다.
3. **Stage 3은 조건부** — Open Questions가 0개이면 자동 스킵.
4. **Stage 4는 사용자 확인 필수** — jira:dispatch의 Hard Rule 유지 (Create All 확인 없이 생성 안함).
5. **중간 중단 가능** — 어느 Stage에서든 사용자가 중단 가능. 산출물은 보존됨.
6. **재개 가능** — 산출물이 있으면 해당 Stage 이후부터 재개 가능 (Stage 0-B).
7. **코드 수정 금지** — 전체 파이프라인 동안 코드 파일을 수정하지 않음.
8. **하위 스킬 턴 분리** — Skill tool 호출 직후 같은 턴에서 AskUserQuestion 호출 금지.
9. **Stage 3 → 4 Section 6 재구성 검토 필수** — deep-interview 완료 후 Stage 4로 넘어가기 전 "Section 6 재구성 검토" 절차를 반드시 실행. 인터뷰 결정이 산출물 형식/구조/범위/DoD/의존성/우선순위를 바꿨으면 scope.md Section 6을 Edit으로 업데이트한 후 dispatch. 건너뛰면 dispatch가 outdated Section 6으로 서브태스크를 생성한다. (DPHRS-29 E2E에서 인터뷰 중 산출물 형식이 "마크다운 문서" → "Jira 서브태스크"로 뒤집힘)

## Error Handling

| Scenario | Action |
|----------|--------|
| Stage 1 실패 (recon) | "리서치 실패. 파이프라인을 중단합니다." → STOP |
| Stage 1 LOW Confidence | Confidence Gate 발동 (위 참조): 사용자 선택 Continue/Retry/Stop |
| Stage 2 실패 (assess) | "분석 실패. specs/{KEY}-research.md는 보존됩니다." → STOP |
| Stage 2 에이전트 부분 실패 | assess 완료 출력의 `Confidence: {level}` 행을 파싱하여 확인. MED 이하면 경고 |
| Stage 3 중단 (interview) | "인터뷰 중단. Stage 4로 진행할까요?" → AskUserQuestion |
| Stage 4 Cancel (dispatch) | "서브태스크 생성 취소. 산출물은 보존됩니다." → STOP |
| Stage 4 생성 부분 실패 | dispatch 자체 개별 실패 허용. 결과 테이블에 반영 |
| jira CLI 미설치 | Stage 1에서 조기 발견 → STOP |
| Jira REST API 인증 만료 | Stage 4에서 401 → "인증 만료. `jira init` 실행 후 재개하세요." → STOP |
| Jira 코멘트 게시 실패 | 경고 출력 후 파이프라인 성공으로 처리 (코멘트는 부가 기능). Pipeline Summary에 "Failed: {reason}" 표시 |

## Known Issues (2026-04-07 실전 발견)

1. **jira CLI `issue create` 불안정**: issue type config에 ID 필수, assignee email 매칭 불가 → dispatch에서 REST API 직접 사용
2. **Notion MCP 서브에이전트 제약**: recon의 Notion fetch가 서브에이전트에서 실패할 수 있음 → Confidence 저하로 이어짐
3. **jira CLI `--parent` 플래그**: `jira issue list --parent` 동작 안함 → JQL `parent = KEY` 사용
4. **Assignee**: email 기반 매칭 불가, accountId 사용 필수 → dispatch Phase 0에서 `/rest/api/2/myself` 호출
5. **Agent 쿼터 소진 (DPHRS-29 E2E, 2026-04-10)**: assess Phase 1/2의 Explore 에이전트가 동시에 쿼터 소진으로 모두 실패 가능. assess SKILL.md의 "Agent Fallback (쿼터 소진 / Rate Limit)" 절차를 따라 Glob/Grep/Read/Bash 직접 호출로 대체. Confidence는 MED로 capped.
6. **인터뷰 결정에 의한 Section 6 무효화 (DPHRS-29 E2E, 2026-04-10)**: deep-interview 중 산출물 형식/구조/범위가 뒤집히면 assess가 만든 Section 6은 outdated. Stage 4 진입 전 반드시 "Section 6 재구성 검토" 절차 실행 (Hard Rule 9).
