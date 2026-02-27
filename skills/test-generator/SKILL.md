---
name: test-generator
description: >
  Use when: (1) "테스트 코드 작성해줘", (2) "test code 생성해줘", (3) after test-planner creates scenarios,
  (4) need to write tests for specific layer.
---

# Test Generator

Generate pytest test code from test scenarios following project conventions.

## Scope

이 스킬은 **test-planner가 생성한 시나리오** 또는 **특정 layer의 테스트 코드**를 작성합니다.

### Input
- test-planner가 생성한 테스트 시나리오 (Markdown)
- 또는 특정 layer와 feature 지정 (예: "service layer의 research_favorite 테스트")

### Output
- `tests/{layer}/test_{feature}_{layer}.py` 파일

### Reference
- **Controller**: [references/controller-conventions.md](references/controller-conventions.md)
- **Service**: [references/service-conventions.md](references/service-conventions.md)
- **Repository**: [references/repository-conventions.md](references/repository-conventions.md)
- **Factory**: [references/factory-conventions.md](references/factory-conventions.md)
- **프로젝트 컨벤션**: `tests/CLAUDE.md`

## Common Patterns

### File Structure

```python
import pytest
from unittest.mock import MagicMock
from fastapi import status

from src.exceptions.{domain} import {Exception}
from src.services.{feature}_service import {Feature}Service
# ... other imports

class Test{Feature}{Layer}:
    """테스트 클래스 docstring"""

    @pytest.fixture
    def {fixture_name}(self):
        """Fixture docstring"""
        return ...

    def test_{method}_{case}(self, fixtures...):
        """테스트 목적 - 한글로"""
        # Arrange
        ...

        # Act
        ...

        # Assert
        ...
```

### AAA Pattern

모든 테스트는 Arrange-Act-Assert 패턴 사용:

```python
def test_create_success(self, mock_service, test_client):
    """즐겨찾기 추가 성공 테스트"""
    # Arrange
    research_id = 1
    mock_service.create.return_value = None

    # Act
    response = test_client.post(f"/api/researches/{research_id}/favorites")

    # Assert
    assert response.status_code == status.HTTP_201_CREATED
    mock_service.create.assert_called_once()
```

### Docstring Convention

- 테스트 메서드 docstring은 **한글**로 테스트 목적 명시
- 간결하게 1줄로 작성

## Parametrize 패턴

3개 이상 동일 패턴 메서드가 있으면 `@pytest.mark.parametrize` + `getattr()`로 통합:

```python
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "service_method,repo_method,response_class",
    [
        ("get_condition_metadata", "get_conditions_by_codes", ConditionCountResponse),
        ("get_medication_metadata", "get_medications_by_codes", MedicationCountResponse),
    ],
)
async def test_get_metadata_success(
    self, service, mock_repo, service_method, repo_method, response_class, mock_async_session
):
    """메타데이터 조회 성공"""
    # Arrange
    getattr(mock_repo, repo_method).return_value = (mock_rows, 1)

    # Act
    items, total = await getattr(service, service_method)(
        research_id=1, page=1, page_size=10, session=mock_async_session
    )

    # Assert
    assert all(isinstance(r, response_class) for r in items)
    getattr(mock_repo, repo_method).assert_called_once()
```

**적용 기준**: 3개 이상 동일 패턴 메서드가 있을 때. `tests/CLAUDE.md` 참조.

## PATCH Partial Update 패턴

PATCH 엔드포인트는 3가지 테스트 필수:

### 1. Full Update
```python
def test_update_success(self, test_client, mock_service, mock_async_session):
    """수정 성공 테스트"""
    # Arrange
    request_body = {"hypothesis": "가설", "cohorts": [...], "keywords": {...}}
    mock_response = Factory.build_response(research_id=1, **request_body)
    mock_service.update.return_value = mock_response

    # Act
    response = test_client.patch(f"{self.TEST_API_PREFIX}/{research_id}/design", json=request_body)

    # Assert
    call_kwargs = mock_service.update.call_args.kwargs
    assert call_kwargs["hypothesis"] == request_body["hypothesis"]
```

### 2. Partial Update (핵심!)
```python
def test_update_success_partial(self, test_client, mock_service, mock_async_session):
    """일부 필드만 전달하여 부분 수정 성공 테스트"""
    # Arrange
    request_body = {"hypothesis": "수정된 가설만"}
    mock_response = Factory.build_response(hypothesis="수정된 가설만")
    mock_service.update.return_value = mock_response

    # Act
    response = test_client.patch(f"{self.TEST_API_PREFIX}/1/design", json=request_body)

    # Assert
    call_kwargs = mock_service.update.call_args.kwargs
    assert call_kwargs["hypothesis"] == "수정된 가설만"
    assert call_kwargs["cohorts"] is None   # 미전달 필드는 None
    assert call_kwargs["keywords"] is None  # 미전달 필드는 None
```

### 3. Not Found
```python
def test_update_not_found(self, test_client, mock_service, mock_async_session):
    """존재하지 않는 리소스 수정 시 404"""
    mock_service.update.side_effect = NotFoundException("Not found")
    response = test_client.patch(f"{self.TEST_API_PREFIX}/999/design", json={"hypothesis": "가설"})
    assert_error_response(response=response, expected_status_code=status.HTTP_404_NOT_FOUND)
```

## call_args.kwargs 패턴

`assert_called_once_with()` 대신 **`call_args.kwargs`** 사용이 PATCH 테스트에서 더 적합:

```python
# assert_called_once_with 방식 (모든 파라미터 나열 필요 - 장황함)
mock_service.update.assert_called_once_with(
    research_id=1, hypothesis="가설", cohorts=None, variables=None, ..., session=mock_async_session
)

# call_args.kwargs 방식 (관심 있는 필드만 검증 - 권장)
call_kwargs = mock_service.update.call_args.kwargs
assert call_kwargs["research_id"] == 1
assert call_kwargs["hypothesis"] == "가설"
assert call_kwargs["cohorts"] is None
```

**언제 사용**: Optional 파라미터가 4개 이상인 메서드, PATCH 엔드포인트

## Factory 사용 가이드 (Layer별)

| Layer | Factory Method | 이유 |
|-------|---------------|------|
| Controller | `Factory.build_response()` | Service mock 반환값 = Pydantic Response 스키마 |
| Service | `Factory.build()` 또는 실제 Model 인스턴스 | Repository mock 반환값 = SQLAlchemy Model. `model_validate`는 실제 속성 접근 필요 |
| Repository | `Factory.create(session)` | 실제 DB에 데이터 생성 |

### Service 테스트에서 model_validate 주의

Service가 `model_validate(entity)`를 사용하면 **MagicMock이 아닌 실제 Model 인스턴스** 필요:

```python
# BAD: MagicMock은 model_validate에서 실패할 수 있음
mock_repo.get.return_value = MagicMock(spec=ResearchDesign)

# GOOD: Factory.build()로 실제 Model 인스턴스 생성
mock_repo.get.return_value = ResearchDesignFactory.build(id=1, research_id=1)
```

### Factory **kwargs 스프레드 패턴

```python
update_params = {"hypothesis": "수정된 가설", "cohorts": [...]}
mock_updated = ResearchDesignFactory.build(research_id=1, **update_params)
```

### Update 테스트: Two-Phase Mock (get + update)

```python
# Arrange
mock_entity = Factory.build(research_id=1)  # 기존 엔티티
mock_updated = Factory.build(research_id=1, **update_params)  # 수정된 엔티티
mock_repo.get_by_research_id_or_throw.return_value = mock_entity
mock_repo.update.return_value = mock_updated

# Assert (entity가 update에 전달되었는지 검증)
mock_repo.update.assert_called_once_with(
    mock_entity,  # 첫 번째 positional arg
    **update_params,
    session=mock_async_session,
)
```

## Project Fixtures

### conftest.py에서 제공하는 fixtures

| Fixture | Scope | 용도 |
|---------|-------|------|
| `mock_async_session` | session | Mocked AsyncSession |
| `mock_async_connection` | session | Mocked AsyncConnection (psycopg) |
| `mock_current_user_id` | session | 테스트 사용자 ID (1) |
| `app` | session | FastAPI app with overrides |
| `test_client` | session | TestClient 인스턴스 |
| `mock_services` | function, **autouse** | 모든 서비스 mock dict (자동 적용) |
| `async_session` | function | 실제 DB 세션 (Repository용, `setup_tables` 의존) |
| `setup_tables` | class | 테이블 생성/정리 (`async_session`이 자동 호출) |

**Note:** `mock_services`는 `autouse=True`로 설정되어 모든 테스트에 자동 적용됩니다.

### mock_services에서 개별 서비스 추출

Controller 테스트에서 반드시 fixture로 추출해서 사용:

```python
@pytest.fixture
def mock_research_design_service(self, mock_services):
    return mock_services["research_design_service"]
```

### Helper Functions

```python
from tests.utils.helpers import assert_success_response, assert_error_response

# Success response 검증
assert_success_response(
    response=response,
    expected_data=expected_data,  # Pydantic 객체 또는 dict
    expected_meta=Meta(),
    expected_status_code=status.HTTP_200_OK,
)

# Paginated response 검증
from src.schemas.common import Pagination, PaginationMeta
assert_success_response(
    response=response,
    expected_data=[item.model_dump(mode="json") for item in mock_items],
    expected_meta=PaginationMeta(pagination=Pagination(page=1, page_size=10, total_count=total)),
    expected_status_code=status.HTTP_200_OK,
)

# Error response 검증
assert_error_response(
    response=response,
    expected_status_code=status.HTTP_404_NOT_FOUND,
)
```

## Common Imports

### Controller Tests
```python
import pytest
from fastapi import status

from src.exceptions.{domain} import {Exception}
from src.schemas.common import Meta
from tests.factories.{feature} import {Feature}Factory
from tests.utils.helpers import assert_error_response, assert_success_response
```

### Service Tests
```python
from unittest.mock import MagicMock
from datetime import datetime

import pytest

from src.exceptions.{domain} import {Exception}
from src.models.{feature} import {Model}       # model_validate에 실제 인스턴스 필요
from src.repositories.{feature}_repository import {Feature}Repository
from src.schemas.{feature} import {Feature}Response  # isinstance 검증용
from src.services.{feature}_service import {Feature}Service
from tests.factories.{feature} import {Feature}Factory
```

### Repository Tests
```python
import pytest
from sqlalchemy import select

from src.models.{feature} import {Model}
from src.repositories.{feature}_repository import {Feature}Repository
from tests.factories.{feature} import {Feature}Factory
```

## Naming Conventions

### File naming
```
tests/controllers/test_{feature}_controller.py
tests/services/test_{feature}_service.py
tests/repositories/test_{feature}_repository.py
```

### Class naming
```python
class TestResearchDesignController:
class TestResearchDesignService:
class TestResearchDesignRepository:
```

### Method naming
```python
def test_{method}_{scenario}(self, ...):
    # Examples:
    # test_create_success
    # test_update_research_design_success
    # test_update_research_design_success_partial
    # test_get_not_found
```

## Notes

- `@pytest.mark.asyncio` 데코레이터는 async 테스트에만 사용
- Controller 테스트는 동기 메서드 (TestClient 사용)
- Service/Repository 테스트는 async 메서드
- Mock 객체는 `MagicMock(spec=ClassName)` 형태로 생성
- 3개 이상 동일 패턴 메서드는 반드시 `@pytest.mark.parametrize`로 통합
- **Controller error-path 테스트에서도 반드시 `assert_called_once_with`로 서비스 호출 인자 검증**
- **Repository 테스트는 custom 메서드만** (상속된 BaseRepository 메서드는 테스트 불필요)
- **복합 UniqueConstraint 모델은 다중 행위자 edge case 테스트 포함**
