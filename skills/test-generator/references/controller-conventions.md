# Controller Test Conventions

## Structure

```python
import pytest
from fastapi import status

from src.exceptions.{domain} import {Exception}
from src.schemas.common import Meta
from tests.utils.helpers import assert_error_response, assert_success_response


class Test{Feature}Controller:
    TEST_API_PREFIX = "/api/{resources}"

    @pytest.fixture
    def mock_{feature}_service(self, mock_services):
        return mock_services["{feature}_service"]

    def test_{method}_success(
        self,
        test_client,
        mock_{feature}_service,
        mock_async_session,
        mock_current_user_id,
    ):
        """성공 테스트 - 한글로"""
        # Arrange
        mock_{feature}_service.{method}.return_value = expected_value

        # Act
        response = test_client.{http_method}(f"{self.TEST_API_PREFIX}/{path}")

        # Assert
        assert_success_response(
            response=response,
            expected_data=expected_data,
            expected_meta=Meta(),
            expected_status_code=status.HTTP_200_OK,
        )
        mock_{feature}_service.{method}.assert_called_once_with(
            # expected arguments
            session=mock_async_session,
        )
```

## Key Points

### Fixtures
- `test_client`: FastAPI TestClient
- `mock_services`: 모든 서비스 mock을 담은 dict
- `mock_async_session`: Mocked DB session
- `mock_current_user_id`: 테스트 사용자 ID (기본값 1)

### Mock Service 접근
```python
@pytest.fixture
def mock_research_favorite_service(self, mock_services):
    return mock_services["research_favorite_service"]
```

### HTTP Methods
```python
# GET
response = test_client.get(f"{self.TEST_API_PREFIX}/{id}")

# POST with body
response = test_client.post(
    f"{self.TEST_API_PREFIX}",
    json={"key": "value"}
)

# PUT/PATCH
response = test_client.put(f"{self.TEST_API_PREFIX}/{id}", json={...})

# DELETE
response = test_client.delete(f"{self.TEST_API_PREFIX}/{id}")
```

### Response Assertions

```python
# Success with data
assert_success_response(
    response=response,
    expected_data={"id": 1, "name": "test"},
    expected_meta=Meta(),
    expected_status_code=status.HTTP_200_OK,
)

# Success with no content (204)
assert_success_response(
    response=response,
    expected_data=None,
    expected_meta=None,
    expected_status_code=status.HTTP_204_NO_CONTENT,
)

# Created (201)
assert_success_response(
    response=response,
    expected_data=None,
    expected_meta=Meta(),
    expected_status_code=status.HTTP_201_CREATED,
)

# Error
assert_error_response(
    response=response,
    expected_status_code=status.HTTP_404_NOT_FOUND,
)
```

### Exception Handling

**중요: Error-path 테스트에서도 반드시 `assert_called_once_with`를 포함합니다.**
예외가 발생하더라도 서비스가 올바른 인자로 호출되었는지 검증해야 합니다.

```python
def test_create_research_not_found(
    self, test_client, mock_service, mock_async_session, mock_current_user_id
):
    """존재하지 않는 연구에 대한 요청 시 404"""
    # Arrange
    research_id = 999
    mock_service.create.side_effect = ResearchNotFoundException(
        "Research with id 999 not found"
    )

    # Act
    response = test_client.post(f"{self.TEST_API_PREFIX}/{research_id}/favorites")

    # Assert
    assert_error_response(
        response=response,
        expected_status_code=status.HTTP_404_NOT_FOUND,
    )
    # Error-path에서도 서비스 호출 인자 검증 필수
    mock_service.create.assert_called_once_with(
        research_id=research_id,
        user_id=mock_current_user_id,
        session=mock_async_session,
    )
```

### PATCH 엔드포인트 테스트

PATCH API는 반드시 3가지 시나리오 포함: **full update**, **partial update**, **not_found**

Optional 필드가 4개 이상인 경우, partial update 테스트에서 `call_args.kwargs` 패턴 사용:

```python
def test_update_partial(self, test_client, mock_service, mock_async_session):
    """일부 필드만 전달하여 부분 수정 성공 테스트"""
    # Act
    response = test_client.patch(
        f"{self.TEST_API_PREFIX}/{id}",
        json={"hypothesis": "수정된 가설만"},
    )

    # Assert - 미전달 필드가 None으로 전달되는지 검증
    call_kwargs = mock_service.update.call_args.kwargs
    assert call_kwargs["hypothesis"] == "수정된 가설만"
    assert call_kwargs["cohorts"] is None
```

## Example

```python
import pytest
from fastapi import status

from src.exceptions.research import ResearchNotFoundException
from src.schemas.common import Meta
from tests.utils.helpers import assert_error_response, assert_success_response


class TestResearchFavoriteController:
    TEST_API_PREFIX = "/api/researches"

    @pytest.fixture
    def mock_research_favorite_service(self, mock_services):
        return mock_services["research_favorite_service"]

    def test_create_success(
        self,
        test_client,
        mock_research_favorite_service,
        mock_async_session,
        mock_current_user_id,
    ):
        """즐겨찾기 추가 성공 테스트"""
        # Arrange
        research_id = 1
        mock_research_favorite_service.create.return_value = None

        # Act
        response = test_client.post(f"{self.TEST_API_PREFIX}/{research_id}/favorites")

        # Assert
        assert_success_response(
            response=response,
            expected_data=None,
            expected_meta=Meta(),
            expected_status_code=status.HTTP_201_CREATED,
        )
        mock_research_favorite_service.create.assert_called_once_with(
            research_id=research_id,
            user_id=mock_current_user_id,
            session=mock_async_session,
        )
```
