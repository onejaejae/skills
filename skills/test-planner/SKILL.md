---
name: test-planner
description: >
  Use when: (1) "테스트 시나리오 작성해줘", (2) "테스트 계획 만들어줘", (3) "test plan 만들어줘",
  (4) creating test plan for new features, (5) before writing test code.
---

# Test Planner

Analyze implementation code and generate comprehensive test scenarios grouped by architectural layer.

## Scope

이 스킬은 **특정 feature 단위**로 테스트 시나리오를 생성합니다.

### Input
사용자가 제공하는 정보:
- Feature 이름 (예: `research_favorite`)
- 또는 구현 파일 경로 (예: `src/services/research_favorite_service.py`)

### Target Files
제공된 feature를 기반으로 관련 파일만 분석:
```
src/controllers/{feature}.py
src/services/{feature}_service.py
src/repositories/{feature}_repository.py
```

### Reference
- 시나리오 템플릿: [references/scenario-template.md](references/scenario-template.md)
- 프로젝트 테스트 컨벤션: `tests/CLAUDE.md`

### NOT in Scope
- 전체 codebase 스캔
- 관련 없는 다른 feature 분석

## Workflow

1. **Identify target files** - Feature 이름으로 controller, service, repository 파일 찾기
2. **Analyze each layer** - 각 파일의 public 메서드, 의존성, 비즈니스 로직 추출
3. **Identify consolidation opportunities** - 동일 패턴 메서드 그룹화 (parametrize 후보)
4. **Generate scenarios** - [references/scenario-template.md](references/scenario-template.md) 템플릿으로 시나리오 생성
5. **Output grouped plan** - Layer별로 그룹화하여 병렬 실행 가능한 형태로 출력

## Analysis Checklist

각 파일 분석 시 확인할 항목:
- Public 메서드와 시그니처
- 주입된 의존성 (services, repositories)
- 입력 유효성 검증 규칙
- 비즈니스 로직 분기 (success, error cases)
- 예외 처리
- **동일 시그니처/패턴 메서드 그룹** (parametrize 후보)
- **PATCH/PUT 구분** (Optional 필드 여부)
- **Factory 사용 필요성** (Model vs Response 스키마)

## Parametrize 패턴 (중요)

3개 이상 동일 패턴의 메서드가 있으면 `@pytest.mark.parametrize`로 통합:

```markdown
#### Parametrized Scenario Group: get_{type}_metadata
- **Pattern**: 동일한 시그니처의 메타데이터 조회 메서드
- **Methods**: get_condition_metadata, get_medication_metadata, ...
- **Parametrize Keys**: (service_method, repo_method, response_class, pk_field, ...)
- **Cases**:
  - success: 정상 조회 (parametrize across all methods)
  - empty_codes: 코드 없을 때 빈 결과 (parametrize across all methods)
  - not_found: 리서치 미존재 (parametrize across all methods)
- **개별 테스트 필요**: 대표 메서드 1개로 상세 로직 테스트 (예: condition_metadata)
```

**적용 기준**: `tests/CLAUDE.md`의 Parametrize 패턴 섹션 참조

## PATCH Partial Update 시나리오

PATCH 엔드포인트는 반드시 3가지 시나리오 포함:

1. **Full update**: 모든 필드 전달 → 모든 값 정상 전달 검증
2. **Partial update**: 일부 필드만 전달 → 미전달 필드가 `None`으로 전달되는지 검증
3. **Not found**: 존재하지 않는 리소스 → 404 에러

## Class-Level Test Data

공유 테스트 데이터가 많으면 클래스 상수로 정의:

```markdown
#### Shared Test Data
- `CONDITION_CODES`: [{"name": "Type2 Diabetes", "codes": ["E11"]}]
- `MEDICATION_CODES`: [{"name": "Metformin", "codes": ["A10BA02"]}]
```

## Factory 사용 가이드

시나리오에 Factory 사용 방법을 명시:
- **Controller 테스트**: `Factory.build_response()` (Pydantic Response 스키마)
- **Service 테스트**: `Factory.build()` (SQLAlchemy Model) - `model_validate`가 실제 속성 접근 필요
- **Repository 테스트**: `Factory.create()` (실제 DB 저장)

## Output Format

```markdown
# Test Plan: {Feature Name}

## Summary
- Total scenarios: {count}
- Controller: {count} scenarios ({count} parametrized groups)
- Service: {count} scenarios ({count} parametrized groups)
- Repository: {count} scenarios

---

## Layer: Controller
### File: tests/controllers/test_{feature}_controller.py

#### Class: Test{Feature}Controller

#### Shared Test Data (class constants)
- `TEST_API_PREFIX`: "/api/{resources}"
- (필요한 경우 추가 상수)

#### Scenario 1: {method}_success
- **Method**: `{HTTP_METHOD} /api/{path}`
- **Description**: {테스트 목적 - 한글로}
- **Mock setup**: `mock_{service}.{method}.return_value = Factory.build_response(...)`
- **Test Steps**:
  1. Arrange: {Mock 설정}
  2. Act: {API 호출}
  3. Assert: {응답 검증 - assert_success_response 사용}
- **Expected**: HTTP {status_code}

#### Parametrized Group: {group_name}
- **Methods**: {method1}, {method2}, ...
- **Parametrize Keys**: ({key1}, {key2}, ...)
- **Success case**: {설명}
- **Error case**: {설명}

---

## Layer: Service
### File: tests/services/test_{feature}_service.py

#### Scenario 1: {method}_success
- **Method**: `{method_name}`
- **Description**: {테스트 목적 - 한글로}
- **Dependencies to mock**: {mocking 대상}
- **Mock return type**: Factory.build() (실제 Model 인스턴스 - model_validate 필요)
- **Test Steps**:
  1. Arrange: {Mock 설정}
  2. Act: {메서드 호출}
  3. Assert: {결과 및 호출 검증}
- **Expected**: {expected return value}

---

## Layer: Repository
### File: tests/repositories/test_{feature}_repository.py

#### Scenario 1: {method}_success
- **Method**: `{method_name}`
- **Description**: {테스트 목적 - 한글로}
- **Database setup**: Factory.create() 사용
- **Test Steps**:
  1. Arrange: {테스트 데이터 생성}
  2. Act: {메서드 호출}
  3. Assert: {DB 상태 검증}
- **Expected**: {expected DB state/return}
```

## Coverage Checklist

### Controller Layer
- [ ] Success case (2xx)
- [ ] Validation error (400) - 필수 파라미터 누락, 빈 값, 잘못된 enum 값
- [ ] Not found (404) - **error-path에서도 `assert_called_once_with` 포함**
- [ ] Permission error (403)
- [ ] PATCH partial update - 일부 필드만 전송 시 None 전달 검증
- [ ] Pagination parameter passthrough (paginated endpoints)
- [ ] Search/filter parameter passthrough
- [ ] Parametrized group (3+ 동일 패턴 메서드)

### Service Layer
- [ ] Success case
- [ ] Business rule validation
- [ ] Not found exception
- [ ] Edge cases (빈 데이터, 경계값)
- [ ] PATCH partial update - None 전파 검증
- [ ] model_validate 변환 검증 (field-by-field)
- [ ] Two-phase mock (get + update) 패턴
- [ ] Parametrized group (3+ 동일 패턴 메서드)

### Repository Layer
- [ ] **Custom 메서드만 테스트** (상속된 BaseRepository 메서드 제외)
- [ ] Read (single, list) - custom query 메서드
- [ ] Update - custom update 메서드
- [ ] Delete (soft/hard delete) - custom delete 메서드
- [ ] Edge cases (not found, 빈 결과)
- [ ] **복합 UniqueConstraint** - 다중 행위자 edge case (예: 다른 user가 같은 research 즐겨찾기)

## Notes

- Description은 한글로 작성
- 각 시나리오는 독립적으로 실행 가능해야 함
- Layer별로 그룹화하여 병렬 처리 가능하도록 구성
- 동일 패턴 메서드 3개 이상이면 반드시 parametrize 그룹으로 통합
