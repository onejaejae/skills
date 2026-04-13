# Report Template — jira:assess Output

이 템플릿의 섹션 번호와 헤더는 `jira:dispatch`가 Section 6을 파싱하므로 변경하지 않는다.

---

```markdown
# Scope Analysis: {KEY} — {Title}

> Scope report by /jira:assess | {YYYY-MM-DD} | Confidence: {HIGH|MED|LOW} ({N}/6 agents)

**Research**: ~/.claude/specs/{KEY}-research.md
**Project**: {project_root}

---

## 1. ASIS Summary

현재 코드베이스 상태를 레이어별로 정리한다.

| Layer | Status | Key Components | Notes |
|-------|--------|---------------|-------|
| DB | {schema/tables} | {table names} | {indexes, constraints} |
| Model | {ORM models} | {model classes} | {validations, relations} |
| Service | {business logic} | {service classes} | {dependencies} |
| API | {endpoints} | {routes} | {auth, middleware} |
| Test | {coverage} | {test files} | {patterns, fixtures} |
| Config | {settings} | {config files} | {env vars, constants} |

### Layer Details

#### DB Layer
{Detailed description of relevant tables, columns, relationships, indexes}

#### Model Layer
{ORM models, fields, validations, computed properties}

#### Service Layer
{Business logic flow, service dependencies, key methods}

#### API Layer
{Endpoints, request/response schemas, authentication, rate limiting}

#### Test Layer
{Existing test coverage, test patterns, fixtures}

#### Config Layer
{Related settings, environment variables, constants}

---

## 2. TOBE Requirements Gap

요구사항별 현재 상태와 Gap을 분석한다.

| # | Requirement | Status | Gap Description | Complexity |
|---|-------------|--------|----------------|------------|
| 1 | {requirement} | DONE | - | - |
| 2 | {requirement} | PARTIAL | {what's missing} | MED |
| 3 | {requirement} | MISSING | {what needs to be built} | HIGH |

**Status Legend**: DONE (이미 구현) / PARTIAL (일부 구현) / MISSING (미구현)
**Complexity Legend**: LOW (단순 추가) / MED (기존 코드 수정) / HIGH (구조 변경)

### Dependency Map
{Requirements dependencies — which must be done before others}

### Hidden Requirements
{Requirements not in the spec but necessary for implementation}

---

## 3. Impact Matrix

변경이 필요한 모든 파일의 영향도를 평가한다.

| File | Change Type | Risk | Effort (h) | Dependencies | Reason |
|------|-------------|------|-----------|-------------|--------|
| {path/to/file.py} | MODIFY | HIGH | 4 | - | {why} |
| {path/to/new.py} | CREATE | MED | 2 | file.py | {why} |
| {path/to/test.py} | MODIFY | LOW | 1 | file.py | {why} |

**Change Type Legend**: CREATE / MODIFY / DELETE / NONE (reference only)
**Risk Legend**: HIGH (기존 기능 깨질 수 있음) / MED (테스트 필요) / LOW (안전)

---

## 4. Risk Summary

| Risk | Count | Key Items |
|------|-------|-----------|
| HIGH | {N} | {list of HIGH risk items} |
| MED | {N} | {list of MED risk items} |
| LOW | {N} | {list of LOW risk items} |
| UNKNOWN | {N} | {items covered by failed agents} |

### Risk Details

#### HIGH Risk Items
{Detailed explanation of each HIGH risk item, why it's risky, and mitigation strategies}

#### Migration Risks
{Database migration needs, data integrity concerns, rollback strategy}

#### Backward Compatibility
{Breaking changes, API versioning needs, deprecation paths}

---

## 5. Effort Estimation

### Scope A: Minimum Viable (핵심 요구사항만)

| Category | Hours | Items |
|----------|-------|-------|
| DB/Migration | {h} | {list} |
| Model | {h} | {list} |
| Service | {h} | {list} |
| API | {h} | {list} |
| Test | {h} | {list} |
| **Total** | **{h}** | |

### Scope B: Full Implementation (전체 요구사항 + 테스트 + 문서)

| Category | Hours | Items |
|----------|-------|-------|
| DB/Migration | {h} | {list} |
| Model | {h} | {list} |
| Service | {h} | {list} |
| API | {h} | {list} |
| Test | {h} | {list} |
| Documentation | {h} | {list} |
| **Total** | **{h}** | |

---

## 6. Task Definition Candidates

jira:dispatch의 직접 입력이 되는 태스크 테이블. 이 테이블의 구조를 변경하지 않는다.

| # | Task | Priority | Assignee | Dependencies | Effort | DoD |
|---|------|----------|----------|-------------|--------|-----|
| 1 | {task title} | HIGH | - | - | {h}h | {specific completion criteria} |
| 2 | {task title} | HIGH | - | #1 | {h}h | {specific completion criteria} |
| 3 | {task title} | MED | - | #1 | {h}h | {specific completion criteria} |
| 4 | {task title} | MED | - | #2, #3 | {h}h | {specific completion criteria} |
| 5 | {task title} | LOW | - | #4 | {h}h | {specific completion criteria} |

### Task Notes
{Additional context for specific tasks — edge cases, alternative approaches, etc.}

---

## 7. Risks & Open Questions

### Open Questions (from Research Report)
{리서치 리포트 Section 6에서 전파된 미결 항목}

- [ ] {question from research} — Source: {original source}

### New Risks (from Analysis)
{코드베이스 분석 중 새로 발견된 리스크/미결 항목}

- [ ] {new risk or question} — Found in: {file or analysis context}

### Deployment Considerations
{배포 순서 제약, 마이그레이션 타이밍, 피처 플래그 필요 여부}

---

## 8. Agent Coverage Notes

| Agent | Role | Status | Files Found | Notes |
|-------|------|--------|-------------|-------|
| #1 | schema-model-finder | {OK/SKIPPED} | {N} | {notes} |
| #2 | service-api-finder | {OK/SKIPPED} | {N} | {notes} |
| #3 | test-config-finder | {OK/SKIPPED} | {N} | {notes} |
| #4 | asis-documenter | {OK/SKIPPED} | {N layers} | {notes} |
| #5 | tobe-gap-analyzer | {OK/SKIPPED} | {N gaps} | {notes} |
| #6 | impact-risk-assessor | {OK/SKIPPED} | {N files} | {notes} |

{If any agent SKIPPED, note which sections may be incomplete}

---
*Generated by /jira:assess | {YYYY-MM-DD}*
```
