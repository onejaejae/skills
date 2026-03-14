---
name: test-healer
description: >
  Use when: (1) "테스트 검증해줘", (2) "테스트 실행하고 고쳐줘", (3) "test heal",
  (4) after test-generator creates tests, (5) tests are failing and need fixing.
---

# Test Healer

Review, execute, and repair test code to ensure quality and all tests pass.

## Persona

테스트 품질 보증 전문가로서:
- 작성된 테스트 코드의 품질을 꼼꼼히 검토
- 테스트 실행 결과를 분석하여 실패 원인 파악
- **테스트 코드 문제**는 직접 수정, **구현 코드 문제**는 보고
- 모든 테스트가 통과할 때까지 반복

## Scope

이 스킬은 **특정 feature의 테스트 파일**을 대상으로 합니다.

### Input
- Feature 이름 (예: `research_favorite`)
- 또는 테스트 파일 경로 (예: `tests/services/test_research_favorite_service.py`)

### Target Files
```text
tests/controllers/test_{feature}_controller.py
tests/services/test_{feature}_service.py
tests/repositories/test_{feature}_repository.py
```

### Reference
- `tests/conftest.py` - 전역 fixture 정의
- `tests/utils/helpers.py` - assert_success_response, assert_error_response
- `tests/factories/` - Factory 클래스들
- `tests/CLAUDE.md` - 프로젝트 테스트 컨벤션
- **동일 layer의 기존 통과 테스트** - 패턴 참조용

## Prerequisites

**테스트 실행 전 반드시 확인:**
```bash
export ENV=test  # 필수! 없으면 bootstrap.py에서 sys.exit(1) 발생
```

## Workflow

```text
┌─────────────────┐
│  1. Review      │ 테스트 코드 품질 검토
└────────┬────────┘
         ▼
┌─────────────────┐
│  2. Execute     │ ENV=test pytest 실행
└────────┬────────┘
         ▼
    ┌────┴────┐
    │ Pass?   │
    └────┬────┘
    Yes  │  No
    ▼    ▼
┌──────┐ ┌─────────────────┐
│ Done │ │ 3. Analyze      │ 실패 원인 분석
└──────┘ └────────┬────────┘
                  ▼
         ┌───────────────────┐
         │ Test code issue?  │
         └────────┬──────────┘
         Yes      │      No
         ▼        ▼
┌─────────────┐  ┌─────────────────┐
│ 4. Repair   │  │ Report impl bug │
└──────┬──────┘  └─────────────────┘
       │
       └──────► (pytest 재실행, 최대 3회)
```

## Phase 1: Review

테스트 코드 품질 검토 체크리스트:

### Convention 준수
- [ ] AAA 패턴 (Arrange-Act-Assert) 사용
- [ ] 한글 docstring으로 테스트 목적 명시
- [ ] 올바른 fixture 사용 (layer에 맞는 fixture)
- [ ] naming convention 준수 (`test_{method}_{case}`)

### 커버리지
- [ ] Success case 포함
- [ ] Error/Exception cases 포함
- [ ] Edge cases 고려 (빈 데이터, 경계값 등)
- [ ] PATCH: partial update 시나리오 포함

### Mock 설정
- [ ] Mock 대상이 올바른가
- [ ] return_value / side_effect 설정이 적절한가
- [ ] assert_called_once_with 검증이 올바른가
- [ ] **Factory 메서드가 layer에 맞는가** (build vs build_response)

### Layer별 패턴 참조
수정 전에 **동일 layer의 기존 통과 테스트**를 먼저 읽어서 프로젝트 패턴 파악:
```bash
# 같은 layer의 다른 테스트 파일 참조
tests/controllers/test_research_favorite_controller.py
tests/services/test_research_favorite_service.py
```

## Phase 2: Execute

```bash
# 반드시 ENV=test 포함
ENV=test pytest tests/{layer}/test_{feature}_{layer}.py -v

# 실패한 테스트만 재실행
ENV=test pytest tests/{layer}/test_{feature}_{layer}.py -v --ff

# 첫 번째 실패에서 중단
ENV=test pytest tests/{layer}/test_{feature}_{layer}.py -v -x
```

## Phase 3: Analyze

실패 원인 분류:

### 테스트 코드 문제 (수정 대상)
- Mock 설정 오류 (잘못된 return_value, side_effect)
- Assertion 오류 (기대값 불일치)
- Fixture 사용 오류
- Import 오류
- 비동기 처리 오류 (`@pytest.mark.asyncio` 누락 등)

### 구현 코드 문제 (보고 대상)
- 실제 비즈니스 로직 버그
- API 응답 형식 변경
- Exception 타입 불일치
- 의존성 주입 오류

## Phase 4: Repair

### Common Fixes

**1. Factory 메서드 혼동 (Model vs Schema)**
```python
# WRONG: Controller 테스트에서 Model 반환
mock_service.get.return_value = ResearchDesignFactory.build()  # SQLAlchemy Model

# CORRECT: Controller 테스트는 Response 스키마 필요
mock_service.get.return_value = ResearchDesignFactory.build_response()  # Pydantic Schema
```

**2. mock_services fixture 추출 누락**
```python
# WRONG: fixture 미정의 상태에서 사용 시 "fixture not found" 에러
def test_get(self, mock_research_design_service):  # fixture가 없음!

# CORRECT: mock_services에서 추출하는 fixture 정의
@pytest.fixture
def mock_research_design_service(self, mock_services):
    return mock_services["research_design_service"]
```

**3. model_validate에 MagicMock 사용**
```python
# WRONG: Service가 model_validate 사용 시 MagicMock은 실패
mock_repo.get.return_value = MagicMock(spec=ResearchDesign)

# CORRECT: 실제 Model 인스턴스 사용
mock_repo.get.return_value = ResearchDesignFactory.build(id=1)
```

**4. assert_success_response datetime 직렬화**
```python
# WRONG: model_dump 없이 list 비교 시 datetime 직렬화 불일치
assert_success_response(response=response, expected_data=mock_items)

# CORRECT: model_dump(mode="json")으로 datetime을 ISO string으로 변환
assert_success_response(
    response=response,
    expected_data=[item.model_dump(mode="json") for item in mock_items],
)
```

**5. PATCH partial update None 전파 실패**
```python
# WRONG: Factory 기본값이 None을 덮어씀
mock_updated = ResearchDesignFactory.build()  # cohorts에 기본값 들어감
# call_kwargs["cohorts"] is None → FAIL (Factory 기본값이 들어있음)

# CORRECT: 서비스 파라미터 기본값이 None이므로 call_args로 검증
call_kwargs = mock_repo.update.call_args.kwargs
assert call_kwargs["cohorts"] is None  # 미전달 필드는 None
```

**6. Async 데코레이터 추가**
```python
# Before
async def test_create_success(self, ...):

# After
@pytest.mark.asyncio
async def test_create_success(self, ...):
```

**7. Exception type 수정**
```python
# Before - 범용 Exception
with pytest.raises(Exception):

# After - 구체적인 Exception
with pytest.raises(ResearchDesignNotFoundException):
```

## Output Format

```markdown
## Test Heal Report: {Feature}

### Review Summary
- Convention 준수: OK / (issues)
- 커버리지: OK / (missing cases)
- Mock 설정: OK / (issues)

### Execution Result
- Total: {n} tests
- Passed: {n}
- Failed: {n}

### Failures Analysis
| Test | Error Type | Root Cause | Action |
|------|------------|------------|--------|
| test_xxx | AssertionError | Factory build() 대신 build_response() 필요 | 수정함 |
| test_yyy | FixtureError | mock_services 추출 fixture 누락 | 수정함 |

### Repairs Made
1. `test_create_success`: Factory.build() → Factory.build_response()
2. `test_get_not_found`: mock_services 추출 fixture 추가

### Implementation Issues (보고)
1. `ResearchService.create`: 반환 타입이 None이 아님 - 확인 필요

### Final Status
All tests passing / {n} tests still failing (구현 코드 수정 필요)
```

## Notes

- 테스트 코드 문제만 직접 수정
- 구현 코드 문제는 상세히 보고하여 개발자가 판단하도록 함
- 수정 후 반드시 재실행하여 통과 확인
- 3회 이상 동일 테스트 실패 시 구현 코드 문제로 판단
- **수정 전에 동일 layer의 통과 테스트를 참조하여 패턴 파악**
