---
name: jira-assess
description: |
  Use when "/jira:assess", "지라 스코프", "지라 영향도", "코드베이스 분석",
  "jira assess", "jira scope", "ticket scope", "impact assessment",
  "스코프 분석해줘", "영향도 분석", "코드 영향 분석",
  "이 티켓 코드베이스에서 뭘 바꿔야 해".
  Also use as the second step after /jira:recon completes.
---

# /jira:assess — Codebase Impact Assessment

리서치 리포트(`specs/{KEY}-research.md`)를 읽고 대상 프로젝트 코드베이스를 **2라운드 6에이전트** 병렬 분석하여 구조화된 스코프 리포트를 생성한다.

```
Phase 0: Prerequisites (리포트 로드 + 프로젝트 경로 확인)
Phase 1: State Discovery (3 parallel agents)
Phase 2: Deep Analysis (3 parallel agents, Phase 1 결과 주입)
Phase 3: Synthesis → ~/.claude/specs/{KEY}-scope.md
```

## Phase 0: Prerequisites

1. **티켓 키 추출**: 입력에서 Jira 키를 파싱한다.
   - URL: `https://khc.atlassian.net/browse/DPHRS-8?...` → `DPHRS-8`
   - Bare key: `DPHRS-8` → `DPHRS-8`
   - Regex: `([A-Z][A-Z0-9]+-\d+)`
   - 파싱 실패 시: "Jira 키를 파싱할 수 없습니다." → STOP

2. **리서치 리포트 로드**:
   ```bash
   ls ~/.claude/specs/{KEY}-research.md
   ```
   - 존재: Read로 전체 내용 로드
   - 미존재: "리서치 리포트가 없습니다. 먼저 `/jira:recon {KEY}`를 실행해주세요." → STOP

3. **리서치 리포트 파싱**: 로드된 리포트에서 핵심 정보 추출
   - Section 1 (Overview): 티켓 메타데이터
   - Section 2 (Requirements): 요구사항/수용 기준
   - Section 5 (Domain Data): 도메인 테이블/매트릭스
   - Section 6 (Open Questions): 미결 항목
   - **도메인 키워드 추출**: 요구사항과 설명에서 검색에 사용할 키워드 목록 생성
     (예: "RBAC", "role", "permission" → Glob/Grep 검색어로 활용)

4. **대상 프로젝트 경로 확인 (교차 검증 필수)**:

   **Step 4-A: 티켓 컨텍스트에서 프로젝트 힌트 추출**
   - 리서치 리포트의 Section 1 (Overview)에서 다음을 추출:
     - 제목의 서비스명 태그: `[통합홈]`, `[연구검색]`, `[지표모니터]` 등
     - 서브태스크 접두사: `[FE/with-client]`, `[BE/clue-api]` 등
     - Description에 언급된 리포지토리/프로젝트명
   - 추출한 힌트를 `ticket_project_hint`로 저장

   **Step 4-B: cwd 프로젝트 정체성 확인**
   - cwd의 CLAUDE.md, pyproject.toml, package.json, 디렉토리명에서 프로젝트명 추출
   - 예: cwd=`/projects/clue-api` → `cwd_project = "clue-api"`

   **Step 4-C: 교차 검증**
   - `ticket_project_hint`와 `cwd_project`가 **일치**하면 → cwd를 프로젝트 루트로 사용
   - **불일치** 또는 **판단 불가**면 → AskUserQuestion:
     ```
     이 티켓은 '{ticket_project_hint}' 관련으로 보이는데,
     현재 디렉토리는 '{cwd_project}'입니다.
     분석할 프로젝트 경로를 알려주세요.
     ```
   - 소스 코드 미존재 → 동일하게 AskUserQuestion
   - 사용자 응답 후 해당 경로 검증, 실패 시 → STOP

   **Why**: DPHRS-8 E2E에서 티켓은 `[통합홈]`(with-api) 대상이었으나, cwd가 `clue-api`여서 엉뚱한 프로젝트를 분석. 서브태스크 전체가 잘못된 코드베이스 기반으로 생성됨.

5. **상태 출력**:
   ```
   ## jira:assess — {KEY}
   Analyzing codebase impact for {KEY}: {Title}
   Project: {project_root}
   Research: ~/.claude/specs/{KEY}-research.md (Confidence: {level})
   ```
   바로 Phase 1로 진행한다.

## Phase 1: State Discovery (3 parallel agents)

**3개 에이전트를 단일 메시지에서 동시에 실행한다.** 각 에이전트는 `subagent_type: "Explore"`를 사용한다.

리서치 리포트에서 추출한 도메인 키워드를 각 에이전트 프롬프트에 주입하여 검색 정확도를 높인다.

### Agent 1: schema-model-finder

```
Prompt template:
"프로젝트 '{project_root}'에서 다음 요구사항과 관련된 DB 모델, 스키마, 마이그레이션,
DTO, Enum을 모두 찾아라.

요구사항:
{requirements_summary}

검색 키워드: {domain_keywords}

구체적으로 (프로젝트 언어에 맞게 적응):
**Python**: models/**/*.py, migrations/**/*.py, dtos/**/*.py, enums/**/*.py
**TypeScript/JS**: **/models/**/*.ts, **/entities/**/*.ts, **/migrations/**/*.ts, **/dto/**/*.ts, **/enums/**/*.ts
**Go**: **/models/**/*.go, **/entities/**/*.go, **/migrations/**/*.go
**공통 Grep**: 'class.*Model', 'class.*Entity', 'class.*Enum', 'CREATE TABLE', 'schema', 'migration'

1. ORM 모델/엔티티 파일
2. DB 마이그레이션 파일
3. DTO/Schema 파일
4. Enum/상수 정의
5. DB 설정/connection

각 파일에 대해:
- 파일 경로 (repo-relative)
- 관련 클래스/테이블명
- 요구사항과의 관련도 (HIGH/MED/LOW)
- 현재 필드/컬럼 목록 (관련 모델만)"
```

### Agent 2: service-api-finder

```
Prompt template:
"프로젝트 '{project_root}'에서 다음 요구사항과 관련된 서비스, 컨트롤러, API 엔드포인트,
미들웨어를 모두 찾아라.

요구사항:
{requirements_summary}

검색 키워드: {domain_keywords}

구체적으로 (프로젝트 언어에 맞게 적응):
**Python**: services/**/*.py, controllers/**/*.py, views/**/*.py, tasks/**/*.py
**TypeScript/JS**: **/services/**/*.ts, **/controllers/**/*.ts, **/routes/**/*.ts, **/middleware/**/*.ts
**Go**: **/handlers/**/*.go, **/services/**/*.go, **/middleware/**/*.go, **/routes/**/*.go
**공통 Grep**: 'route', 'endpoint', 'handler', 'middleware', 'guard', 'interceptor', 'decorator'

1. 서비스 레이어 (비즈니스 로직)
2. 컨트롤러/핸들러 (요청 처리)
3. API 라우트/URL 설정
4. 미들웨어/데코레이터/가드
5. 비동기 작업 (Celery/Bull/Worker)

각 파일에 대해:
- 파일 경로 (repo-relative)
- 클래스/함수명
- API 엔드포인트 (있으면)
- 요구사항과의 관련도 (HIGH/MED/LOW)
- 핵심 로직 요약 (3줄 이내)"
```

### Agent 3: test-config-finder

```
Prompt template:
"프로젝트 '{project_root}'에서 다음 요구사항과 관련된 테스트, 설정, 상수, 시드 데이터를
모두 찾아라.

요구사항:
{requirements_summary}

검색 키워드: {domain_keywords}

구체적으로 (프로젝트 언어에 맞게 적응):
**Python**: tests/**/*.py, conftest.py, **/*.cfg, **/constants/**/*.py
**TypeScript/JS**: **/__tests__/**/*.ts, **/*.test.ts, **/*.spec.ts, jest.config.*, .env*
**Go**: **/*_test.go, **/testdata/**, **/config/**
**공통**: .github/**/*.yml, Dockerfile*, docker-compose*, Makefile, package.json, pyproject.toml

1. 테스트 파일 + 테스트 설정
2. conftest/fixture/mock 파일
3. 설정 파일 (앱 설정, 환경 변수)
4. 상수/Enum 정의
5. 시드/초기/픽스처 데이터
6. CI/CD + 인프라 설정

각 파일에 대해:
- 파일 경로 (repo-relative)
- 테스트 클래스/함수명 (테스트 파일인 경우)
- 요구사항과의 관련도 (HIGH/MED/LOW)
- 현재 테스트 커버리지 상태 (있으면)"
```

### Agent Fallback (쿼터 소진 / Rate Limit)

에이전트 호출이 **인프라 제약** (쿼터 소진, rate limit, 세션 한도)으로 실패한 경우에만 적용한다. 프로젝트/코드 문제로 인한 실패는 일반 Agent Failure Tier를 따른다.

**감지 조건** (다음 중 하나):
- "You've hit your limit · resets ..." 같은 쿼터 에러
- "rate limit exceeded" / 429 응답
- 모든 Phase 1 에이전트가 동일한 인프라 에러로 실패

**Fallback 절차** — 에이전트 대신 직접 도구 호출로 동일한 조사를 수행한다:

1. **schema-model-finder → 직접 Glob/Grep**:
   ```
   Glob("**/models/**/*.py"), Glob("**/exceptions/**/*.py"), Glob("**/migrations/**/*.py")
   Grep("class.*Model|class.*Entity|class.*Enum", glob="**/*.py")
   ```
   주요 파일은 Read로 직접 확인.

2. **service-api-finder → 직접 Glob/Grep**:
   ```
   Glob("**/services/**/*.py"), Glob("**/controllers/**/*.py"), Glob("**/tasks/**/*.py")
   Grep("@celery.task|@app.route|def [a-z_]+\\(", glob="**/*.py")
   ```
   핵심 로직은 Read로 확인.

3. **test-config-finder → 직접 Glob + Bash**:
   ```
   Glob("tests/**/*.py"), Glob("resources/logging_config/*.json")
   Bash("find {project} -name conftest.py")
   Grep("sentry|raven|rollbar", glob="**/*.py")  # APM 존재 여부
   ```

4. **결과 저장**: 에이전트 fallback이어도 `/tmp/{KEY}-phase1-agent{N}.md` 임시 파일에 저장한다 (Phase 2 핸드오프 호환성 유지).

5. **Confidence 강제 하향**: Agent fallback이 1번이라도 발생하면 Confidence를 **최대 MED**로 제한한다. 직접 조사는 에이전트 탐색보다 커버리지가 낮기 때문.

6. **사용자 고지**: Phase 1 완료 출력에 명시:
   ```
   Phase 1 complete (3/3 agents via direct tool fallback — quota exhausted)
   Confidence capped at MED due to fallback
   ```

**Phase 2에서도 동일 쿼터 제약이 예상되는 경우**, Phase 2 에이전트 3개도 fallback 모드로 진행:
- asis-documenter → `/tmp/{KEY}-phase1-agent*.md` Read + 레이어별 직접 요약
- tobe-gap-analyzer → 요구사항 vs Phase 1 결과를 직접 대조
- impact-risk-assessor → Phase 1 결과의 HIGH 관련 파일에 대해 직접 공수/리스크 추정

**Why**: DPHRS-29 E2E에서 3개 Phase 1 에이전트 모두 쿼터 소진으로 실패. 수동 Glob/Grep/Read로 동일한 결과를 얻었으나, 절차가 문서화되지 않아 매번 애드혹 대응이 필요했다. 인프라 장애는 재발 가능성이 높으므로 명시적 fallback 경로가 필요하다.

### Phase 1 완료 후

3개 에이전트 결과를 수집한다. 실패한 에이전트가 있으면 기록하고 계속 진행한다.

**결과 저장 (Phase 2 핸드오프 최적화)**:
Phase 1 결과는 context window 절감을 위해 임시 파일에 저장한다:

```bash
# 각 에이전트 결과를 임시 파일에 저장
Write("/tmp/{KEY}-phase1-agent1.md", agent_1_full_results)
Write("/tmp/{KEY}-phase1-agent2.md", agent_2_full_results)
Write("/tmp/{KEY}-phase1-agent3.md", agent_3_full_results)
```

Phase 2 에이전트에는 **요약 + 파일 경로**를 주입한다 (전체 결과를 인라인 주입하지 않음):
- 요약: 발견 파일 수, HIGH 관련도 파일 목록 (경로 + 한 줄 설명)
- 전체 결과 경로: `/tmp/{KEY}-phase1-agent{N}.md`를 Read하여 필요 시 참조

**Why**: DPHRS-8 E2E에서 Phase 1 결과를 요약본으로만 전달하여 Phase 2에서 정보 손실 발생 (I3). 임시 파일 저장으로 전체 결과를 보존하면서 context window 부담 최소화.

중간 상태 출력:
```
Phase 1 complete: {N}/3 agents returned
  schema-model: {found_count} files | service-api: {found_count} files | test-config: {found_count} files
  Results saved: /tmp/{KEY}-phase1-agent{1,2,3}.md
Proceeding to deep analysis...
```

## Phase 2: Deep Analysis (3 parallel agents)

**Phase 1 결과를 주입하여 3개 에이전트를 단일 메시지에서 동시에 실행한다.** `subagent_type: "Explore"`를 사용한다.

### Agent 4: asis-documenter

```
Prompt template:
"다음 코드베이스 탐색 결과를 바탕으로, 요구사항 관점에서 현재 상태(ASIS)를 레이어별로
문서화하라.

요구사항:
{requirements_summary}

코드베이스 탐색 결과:
- DB/모델: {agent_1_results}
- 서비스/API: {agent_2_results}
- 테스트/설정: {agent_3_results}

프로젝트 루트: {project_root}

레이어별로 정리:
1. **DB Layer**: 관련 테이블, 컬럼, 관계, 인덱스
2. **Model Layer**: ORM 모델, 필드, 유효성 검사
3. **Service Layer**: 비즈니스 로직 흐름, 의존성
4. **API Layer**: 엔드포인트, 요청/응답 스키마, 인증
5. **Test Layer**: 기존 테스트 커버리지, 테스트 패턴
6. **Config Layer**: 관련 설정, 환경 변수, 상수

각 레이어에서:
- 현재 동작 방식 요약
- 요구사항과 직접 관련된 코드 위치 (파일:라인)
- 재사용 가능한 기존 코드/패턴

필요하면 실제 파일을 Read해서 정확한 내용을 확인하라."
```

### Agent 5: tobe-gap-analyzer

```
Prompt template:
"리서치 리포트의 요구사항과 코드베이스 현재 상태를 비교하여 Gap 분석을 수행하라.

요구사항 (리서치 리포트에서):
{requirements_full}

수용 기준:
{acceptance_criteria}

코드베이스 탐색 결과:
- DB/모델: {agent_1_results}
- 서비스/API: {agent_2_results}
- 테스트/설정: {agent_3_results}

프로젝트 루트: {project_root}

각 요구사항에 대해:
| 요구사항 | 상태 | Gap 설명 | 복잡도 |
- **상태**: DONE (이미 구현됨) / PARTIAL (일부 구현) / MISSING (미구현)
- **Gap 설명**: PARTIAL/MISSING인 경우 구체적으로 무엇이 없는지
- **복잡도**: LOW (단순 추가) / MED (기존 코드 수정) / HIGH (구조 변경 필요)

또한:
- 기존 코드와 충돌 가능성
- 요구사항 간 의존 관계
- 숨겨진 요구사항 (리서치에 명시되지 않았지만 구현에 필요한 것)
- **유사 기능 감지**: 새 API/기능을 MISSING으로 판정할 때, 기존에 유사한 엔드포인트나 메서드가 부분적으로 존재하는지 확인. 있으면 '기존 X 확장 vs 신규 생성' 설계 선택지를 Section 7에 Open Question으로 추가.

필요하면 실제 파일을 Read해서 정확한 Gap을 확인하라."
```

### Agent 6: impact-risk-assessor

```
Prompt template:
"코드베이스 탐색 결과를 바탕으로, 요구사항 구현 시 영향받는 모든 파일의 변경 타입,
리스크, 공수를 평가하라.

요구사항:
{requirements_summary}

코드베이스 탐색 결과:
- DB/모델: {agent_1_results}
- 서비스/API: {agent_2_results}
- 테스트/설정: {agent_3_results}

프로젝트 루트: {project_root}

파일별 영향도 테이블:
| 파일 경로 | 변경 타입 | 리스크 | 공수(h) | 의존성 | 이유 |
- **변경 타입**: CREATE / MODIFY / DELETE / NONE(참조만)
- **리스크**: HIGH (기존 기능 깨질 수 있음) / MED (테스트 필요) / LOW (안전)
- **공수(h)**: 시간 단위 추정
- **의존성**: 이 파일 변경 전에 먼저 변경해야 할 파일

리스크 요약:
- HIGH 리스크 항목과 그 이유
- 마이그레이션 필요 여부
- 하위 호환성 이슈
- 배포 순서 제약

공수 추정 (중급 개발자 기준 — 해당 프로젝트 언어/프레임워크 경험 2~3년차):
- Scope A (최소): 핵심 요구사항만 구현
- Scope B (확장): 전체 요구사항 + 테스트 + 문서

필요하면 실제 파일을 Read해서 정확한 리스크를 확인하라."
```

### Phase 2 완료 후

6개 에이전트 결과를 모두 수집한다.

중간 상태 출력:
```
Phase 2 complete: {N}/3 agents returned (total: {M}/6)
Synthesizing scope report...
```

## Phase 3: Synthesis

모든 에이전트 결과를 `references/report-template.md`의 8-섹션 구조로 합성하여
`~/.claude/specs/{KEY}-scope.md`에 저장한다.

**직접 합성한다 — 에이전트 불필요.**

### Confidence 계산

Confidence는 다음 두 요소의 **최솟값**:

| 요소 | HIGH | MED | LOW |
|------|------|-----|-----|
| Agent Coverage | 5-6/6 성공 | 3-4/6 성공 | 1-2/6 성공 |
| Gap Completeness | 모든 요구사항에 gap 분석 존재 | 1-2개 누락 | 3개 이상 누락 |

### 합성 규칙

1. **Section 1 (ASIS Summary)**: Agent 4 (asis-documenter) 결과를 레이어별 테이블로 정리
2. **Section 2 (TOBE Requirements Gap)**: Agent 5 (tobe-gap-analyzer) 결과를 요구사항별 테이블로
3. **Section 3 (Impact Matrix)**: Agent 6 (impact-risk-assessor)의 파일별 테이블
4. **Section 4 (Risk Summary)**: Agent 6의 리스크를 HIGH/MED/LOW로 집계
5. **Section 5 (Effort Estimation)**: Agent 6의 Scope A/B 공수 + 전체 합산. **공수 Reconciliation** 적용 (아래 참조)
6. **Section 6 (Task Definition Candidates)**: **핵심 섹션** — Gap + Impact + Effort를 종합하여 태스크 후보 테이블 생성. 이 섹션이 `jira:dispatch`의 직접 입력이 된다. Effort 형식은 반드시 `{숫자}h` (예: `5h`, `3.5h`).
7. **Section 7 (Risks & Open Questions)**: 리서치 리포트의 Open Questions + 분석 중 발견된 새 리스크
8. **Section 8 (Agent Coverage Notes)**: 각 에이전트 상태 (성공/실패/커버리지)

### 공수 Reconciliation 규칙 (Section 5)

Agent 6 (impact-risk-assessor)의 파일별 공수 추정을 합성할 때:

1. **Variance 검증**: 파일별 공수 중 max/min 비율이 **5배 초과**이면 `HIGH_VARIANCE` 플래그
   - 예: File A = 0.5h, File B = 10h → 비율 20x → HIGH_VARIANCE
2. **Scope 간 차이 검증**: Scope B가 Scope A의 **2배 초과**이면 명시적 주석 추가
   - 예: Scope A = 11.5h, Scope B = 30h (2.6x) → "주의: 테스트/문서화 비용이 핵심 구현의 1.6배. 복잡도 재검토 권장"
3. **이상치 처리**: 개별 파일 공수가 20h 초과이면 Section 7에 Open Question 추가: "파일 {path} 공수 {N}h — 분할 검토 필요"
4. **Near-threshold 처리 (16~20h)**: 파일 공수가 20h를 넘지 않지만 16h 이상 (임계값의 80~100% 구간)이면, Section 5 본문에 **soft recommendation**을 추가한다. 예: "{path} {N}h는 분할 임계값에 근접 (80%+). 구현 착수 전 서브 함수 단위 분할 가능성 설계 리뷰 권장." Section 7 Open Question은 추가하지 않음 (20h 초과만 정식 항목). **Why**: 경계 케이스에서 일관된 판단을 보장. 80% 미만은 정상, 100% 초과는 Open Question, 80~100%는 권고로 3단계 명확 구분.
5. **보수적 추정**: HIGH_VARIANCE가 발생하면 Scope A에 25% 버퍼 추가하고 Section 5에 "±30% 신뢰 구간" 명시. **버퍼는 Section 5의 총합에만 적용**하고, Section 6의 개별 태스크 Effort는 원래 추정값 유지 (개별 태스크를 부풀리면 dispatch에서 왜곡됨)

**Why**: DPHRS-8 E2E에서 Agent 간 공수 추정이 3배 차이 (11.5h vs 30h). Reconciliation 없이 합성하면 dispatch 태스크의 공수 추정 신뢰도가 낮아짐 (I4).

### Section 6 생성 규칙

Section 6은 하류 스킬(`jira:dispatch`)이 파싱하므로 구조가 고정되어야 한다:

```markdown
## 6. Task Definition Candidates

| # | Task | Priority | Assignee | Dependencies | Effort | DoD |
|---|------|----------|----------|-------------|--------|-----|
| 1 | {task title} | HIGH | - | - | {hours}h | {completion criteria} |
| 2 | {task title} | MED | - | #1 | {hours}h | {completion criteria} |
```

태스크 생성 원칙:
- Gap이 MISSING인 요구사항 → 반드시 태스크 생성
- Gap이 PARTIAL인 요구사항 → 나머지 부분에 대한 태스크
- Gap이 DONE인 요구사항 → 태스크 생성 안함
- HIGH 리스크 변경 → 별도 태스크로 분리 (안전한 배포를 위해)
- 마이그레이션 → 항상 별도 태스크 (선행 의존성)
- 테스트 → 구현 태스크와 묶거나, 복잡도 HIGH면 분리
- **Assignee는 비워둔다** — `jira:dispatch`에서 기본값 적용
- **DoD는 구체적으로** — "동작한다" 아닌 "X API가 Y 응답을 반환한다" 수준
- **DoD의 수치는 검증 가능해야** — "기존 N개 테스트"처럼 수치를 포함할 때는 Agent 3 결과에서 정확한 수를 인용. 불확실하면 "기존 테스트 스위트 전체 PASS 유지"로 표현
- **DoD에 전제조건 포함** — 다른 태스크에 의존하는 태스크의 DoD에는 "전제: #N 완료 후 {구체적 상태}" 명시. 예: "전제: DPHRS-90 완료 후 sync_rbac 실행으로 HRS_common_role이 DB에 존재"
- **구현 위치 힌트** — DoD에 변경할 파일 경로를 1~2개 포함. 예: "main/controllers/auth/signup.py의 auth_signup() 내부에서 할당"
- **Dependencies 표기법**: `#N`은 같은 Section 6 테이블 내 태스크 번호. 기존 Jira 서브태스크에 의존하는 경우 `DPHRS-42` 같은 실제 Jira 키를 직접 기재한다. dispatch가 `#N`만 치환하고 Jira 키는 그대로 유지.
- **Effort 합계 일관성 검증**: Section 6 태스크들의 Effort 합계는 Section 5의 Scope A 총합(버퍼 적용 전 원본)과 **±10% 범위 내에서 일치**해야 한다. 불일치 시:
  - 합계가 Scope A보다 **10% 초과 작음** → 누락된 태스크가 있거나 요구사항 일부를 놓쳤다는 신호. Gap 분석 재검토.
  - 합계가 Scope A보다 **10% 초과 큼** → 태스크가 너무 세분화되어 있거나 중복 태스크가 있다는 신호. 병합 검토.
  - **완벽 일치가 항상 옳은 것은 아니다** — 예를 들어 여러 태스크가 같은 파일의 독립 부분을 수정하면 합계가 파일 공수와 달라질 수 있음. 이런 경우 Section 6 아래에 주석으로 차이를 설명한다.
  - **Why**: Section 5는 전체 공수 예산, Section 6은 실행 단위. 둘이 크게 벗어나면 dispatch가 생성하는 Jira 서브태스크의 합이 ticket의 공수 예산과 맞지 않게 되어 스프린트 계획에 혼란을 준다.

### 태스크 병합/분리 기준

**분리 (별도 태스크)해야 하는 경우:**
- DB 마이그레이션은 항상 분리 (롤백 단위)
- HIGH 리스크 파일 변경은 분리 (코드 리뷰 용이)
- 서로 다른 레이어 (DB vs API vs Test)가 독립적으로 배포 가능한 경우
- 공수 8h 초과 → 분리 검토

**병합 (하나의 태스크)해야 하는 경우:**
- 같은 파일을 수정하는 밀접한 변경 (예: 모델 추가 + DTO 추가)
- 공수 2h 미만의 소규모 변경 → 관련 태스크에 병합
- 테스트는 구현 태스크에 병합 (단, 복잡도 HIGH면 분리)
- 설정 변경은 관련 구현 태스크에 병합

**적정 태스크 수:**
- 3~8개가 적정. 10개 초과 시 너무 세분화 → 병합 검토
- 2개 미만 시 너무 뭉뚱그림 → 분리 검토

### 완료 출력

```
## jira:assess Complete

**Confidence: {HIGH|MED|LOW}** — {N}/6 agents completed
**Report**: ~/.claude/specs/{KEY}-scope.md

### Summary
- ASIS: {N} layers documented
- Gap: {done}/{partial}/{missing} requirements
- Impact: {files_count} files ({high}/{med}/{low} risk)
- Effort: Scope A {hours}h / Scope B {hours}h
- Tasks: {task_count} candidates defined

{Risk highlights if any HIGH risks}

Next: /deep-interview (to resolve Open Questions) → /jira:dispatch {KEY}
```

## Hard Rules

1. **자율 실행** — Phase 0의 프로젝트 경로 질문(최대 1회) 외에는 사용자 입력 대기 없이 끝까지 실행
2. **섹션 구조 고정** — 8개 섹션의 번호와 헤더를 변경하지 않는다 (`jira:dispatch`가 Section 6을 파싱)
3. **2라운드 병렬** — Phase 1 (3 agents) 완료 후 Phase 2 (3 agents) 실행. 순차 실행 금지.
4. **Explore 에이전트** — 모든 에이전트는 `subagent_type: "Explore"`를 사용. 코드 수정 금지.
5. **파일 경로는 repo-relative** — 모든 파일 경로는 프로젝트 루트 기준 상대 경로
6. **코드 수정 금지** — 분석만 수행, 코드 파일을 수정하지 않음
7. **리서치 리포트 의존** — 리서치 리포트 없이 실행하지 않음 (Phase 0에서 차단)
8. **Section 6 DoD 필수** — 모든 태스크 후보에 구체적인 DoD가 있어야 한다
9. **실패한 에이전트 = UNKNOWN** — 실패한 에이전트가 담당한 영역은 리스크를 "UNKNOWN"으로 표시
10. **Open Questions 전파** — 리서치 리포트의 미결 항목을 Section 7에 그대로 전파 + 분석 중 발견한 새 항목 추가
11. **Phase 1→2 임시 파일 전달** — Phase 1 결과를 `/tmp/{KEY}-phase1-agent{N}.md`에 저장하고, Phase 2 에이전트에는 요약 + 파일 경로를 주입. 인라인 전체 결과 주입 금지 (context window 절감). (DPHRS-8 E2E I3에서 정보 손실 발생)
12. **공수 Reconciliation 필수** — Section 5 합성 시 파일별 공수 variance가 5배 초과이면 HIGH_VARIANCE 플래그, Scope 간 차이가 2배 초과이면 명시적 주석. (DPHRS-8 E2E I4에서 3배 차이 미검출)
13. **대상 프로젝트 교차 검증 필수** — Phase 0-4에서 티켓 컨텍스트(제목 태그, 서브태스크 접두사, description 내 서비스명)와 cwd 프로젝트를 교차 검증. 불일치 시 사용자에게 확인. cwd에 소스 코드가 있다고 자동으로 대상 프로젝트로 확정하지 않는다. (DPHRS-8 E2E에서 `[통합홈]` 티켓을 `clue-api`에서 분석하여 서브태스크 전체 무효화)
14. **Agent 쿼터/Rate Limit Fallback** — 에이전트 호출이 인프라 제약(쿼터 소진, rate limit)으로 실패하면 STOP하지 않고 **직접 도구 호출(Glob/Grep/Read/Bash)로 fallback**. Fallback 발생 시 Confidence를 MED로 강제 하향. 프로젝트/코드 에러는 일반 Agent Failure Tier를 적용. (DPHRS-29 E2E에서 3개 Phase 1 에이전트 모두 쿼터 소진)

## Error Handling

### Agent Failure Tiers

| Scenario | Action | Confidence |
|----------|--------|------------|
| 1 agent fails (project/code error) | SKIPPED 표시, 나머지로 합성 | HIGH (5/6) |
| 2 agents fail (same phase) | 해당 phase 부분 분석 | MED (4/6) |
| 2 agents fail (cross-phase) | 양쪽 phase 일부 누락 | MED (4/6) |
| 3+ agents fail (project/code) | 부분 리포트 + LOW CONFIDENCE 경고 | LOW (<=3/6) |
| **All Phase 1 fail (quota/rate limit)** | **Agent Fallback 절차 발동 (위 Phase 1 섹션 참조). 직접 도구로 진행.** | **MED (capped)** |
| All Phase 1 fail (project error) | Phase 2 진행 불가 → STOP with "Phase 1 전체 실패. 프로젝트 경로({project_root}) 확인 후 재실행하세요." | NONE — abort |
| Research report parse fail | "리포트 형식이 올바르지 않습니다" → STOP | NONE — abort |
