---
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
argument-hint: [feature-name]
description: 테스트 코드 전체 flow 실행 (시나리오 → 코드 생성 → 검증/수정)
---

# 테스트 코드 생성 워크플로우

특정 feature에 대한 테스트 코드를 자동으로 생성하고 검증합니다.

## 입력된 Feature

$ARGUMENTS

---

## Prerequisites

```bash
export ENV=test  # 필수! 없으면 tests/bootstrap.py에서 sys.exit(1) 발생
```

**프로젝트 테스트 컨벤션**: `tests/CLAUDE.md` 참조

---

## Phase 1: Planning (테스트 시나리오 생성)

### 수행 작업

test-planner skill을 참조하여 feature 코드를 분석하고 테스트 시나리오를 생성합니다.

1. **대상 파일 식별**
   ```text
   src/controllers/{feature}.py
   src/services/{feature}_service.py
   src/repositories/{feature}_repository.py
   ```

2. **각 파일 분석**
   - Public 메서드와 시그니처
   - 의존성 (주입된 서비스/리포지토리)
   - 비즈니스 로직 분기 (success, error cases)
   - 예외 처리
   - **동일 패턴 메서드 그룹** (parametrize 후보)
   - **PATCH/PUT 구분** (Optional 필드 여부)

3. **시나리오 생성**
   - Layer별로 그룹화 (Controller, Service, Repository)
   - 각 메서드별 success/error 케이스
   - **3개 이상 동일 패턴 메서드는 parametrize 그룹으로 통합**
   - **PATCH 엔드포인트는 full/partial/not_found 3가지 시나리오 필수**

4. **Factory 사용 계획**
   - Controller: `Factory.build_response()` (Pydantic Response)
   - Service: `Factory.build()` (SQLAlchemy Model)
   - Repository: `Factory.create(session)` (실제 DB)

### 출력 형식

```markdown
# Test Plan: {Feature Name}

## Summary
- Total scenarios: {count}
- Controller: {count} scenarios ({count} parametrized groups)
- Service: {count} scenarios ({count} parametrized groups)
- Repository: {count} scenarios

## Layer: Controller
### File: tests/controllers/test_{feature}_controller.py
#### Scenario 1: {method}_success
- **Method**: `{HTTP_METHOD} /api/{path}`
- **Description**: {한글로 테스트 목적}
- **Expected**: HTTP {status_code}
...

#### Parametrized Group: {group_name}
- **Methods**: {method1}, {method2}, ...
- **Parametrize Keys**: ({key1}, {key2}, ...)
...

## Layer: Service
...

## Layer: Repository
...
```

### 사용자 확인

> **Phase 1 완료**
>
> 테스트 시나리오가 생성되었습니다.
> 계속 진행하려면 "진행"이라고 입력하세요.

---

## Phase 2: Generation (테스트 코드 생성)

### 수행 작업

test-generator skill을 참조하여 시나리오 기반으로 실제 pytest 코드를 작성합니다.

1. **Convention 참조**
   - Controller: `.claude/skills/test-generator/references/controller-conventions.md`
   - Service: `.claude/skills/test-generator/references/service-conventions.md`
   - Repository: `.claude/skills/test-generator/references/repository-conventions.md`
   - Factory: `.claude/skills/test-generator/references/factory-conventions.md`
   - 프로젝트: `tests/CLAUDE.md`

2. **테스트 파일 생성**
   ```text
   tests/controllers/test_{feature}_controller.py
   tests/services/test_{feature}_service.py
   tests/repositories/test_{feature}_repository.py
   ```

3. **패턴 적용**
   - AAA 패턴 (Arrange-Act-Assert)
   - 한글 docstring
   - 프로젝트 fixture 사용
   - **`@pytest.mark.parametrize` for 3+ 동일 패턴 메서드**
   - **PATCH: `call_args.kwargs` + None 검증 패턴**
   - **Factory: layer별 올바른 메서드 사용**

### Layer별 특징

| Layer | Mock 대상 | Fixture | 특징 |
|-------|----------|---------|------|
| Controller | Service | `mock_services`, `test_client` | 동기 테스트, `Factory.build_response()` |
| Service | Repository | `mock_async_session` | `@pytest.mark.asyncio`, `Factory.build()` |
| Repository | None | `async_session` | 실제 DB, `Factory.create()` |

### 사용자 확인

> **Phase 2 완료**
>
> 테스트 코드가 생성되었습니다.
> 검증을 진행하려면 "진행"이라고 입력하세요.

---

## Phase 3: Healing (검증 및 수정)

### 수행 작업

test-healer skill을 참조하여 테스트를 실행하고 실패 시 수정합니다.

1. **테스트 실행**
   ```bash
   ENV=test pytest tests/**/test_{feature}*.py -v
   ```

2. **실패 분석**
   - 테스트 코드 문제 → 직접 수정
   - 구현 코드 문제 → 보고

3. **수정 후 재실행**
   - 모든 테스트 통과까지 반복 (최대 3회)

### 실패 원인 분류

**테스트 코드 문제 (수정 대상)**
- Mock 설정 오류
- Assertion 오류
- Fixture 사용 오류 (mock_services 추출 누락 등)
- Import/async 오류
- Factory 메서드 혼동 (build vs build_response)
- model_validate에 MagicMock 사용

**구현 코드 문제 (보고 대상)**
- 비즈니스 로직 버그
- API 응답 형식 불일치
- Exception 타입 불일치

### 최종 보고

```markdown
## Test Heal Report: {Feature}

### Execution Result
- Total: {n} tests
- Passed: {n}
- Failed: {n}

### Repairs Made
1. {수정 내용}

### Implementation Issues (보고)
1. {구현 코드 문제 - 있는 경우}

### Final Status
All tests passing / {n} tests still failing
```

---

## 워크플로우 완료

> **테스트 생성 완료!**
>
> ### 생성된 파일
> - `tests/controllers/test_{feature}_controller.py`
> - `tests/services/test_{feature}_service.py`
> - `tests/repositories/test_{feature}_repository.py`
>
> ### 테스트 결과
> - Total: {n} tests
> - Passed: {n}

---

## 주의사항

- 각 Phase는 사용자 확인 후 다음으로 진행
- 문제 발생 시 "중단"하고 수동 진행 가능
- 참조 Skills: test-planner, test-generator, test-healer
- **반드시 `ENV=test` 설정 필요**
- **3개 이상 동일 패턴 메서드는 반드시 parametrize로 통합**
