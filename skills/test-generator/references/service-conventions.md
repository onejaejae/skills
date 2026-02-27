# Service Test Conventions

## Structure

```python
from unittest.mock import MagicMock

import pytest

from src.exceptions.{domain} import {Exception}
from src.repositories.{feature}_repository import {Feature}Repository
from src.services.{feature}_service import {Feature}Service


class Test{Feature}Service:
    @pytest.fixture(scope="function")
    def mock_{dependency}_repository(self) -> MagicMock:
        return MagicMock(spec={Dependency}Repository)

    @pytest.fixture(scope="function")
    def service(
        self,
        mock_{dependency}_repository,
    ) -> {Feature}Service:
        return {Feature}Service(
            {dependency}_repository=mock_{dependency}_repository,
        )

    @pytest.mark.asyncio
    async def test_{method}_success(
        self,
        service,
        mock_{dependency}_repository,
        mock_async_session,
    ):
        """성공 테스트 - 한글로"""
        # Arrange
        mock_{dependency}_repository.{method}.return_value = expected_value

        # Act
        result = await service.{method}(
            **kwargs,
            session=mock_async_session,
        )

        # Assert
        assert result == expected
        mock_{dependency}_repository.{method}.assert_called_once_with(
            **expected_kwargs,
            session=mock_async_session,
        )
```

## Key Points

### Fixtures
- `mock_async_session`: conftest.py에서 제공하는 mocked AsyncSession
- Repository mocks는 클래스 내부에서 정의

### Service Instance Creation
```python
@pytest.fixture(scope="function")
def service(
    self,
    mock_research_repository,
    mock_research_favorite_repository,
) -> ResearchFavoriteService:
    return ResearchFavoriteService(
        research_repository=mock_research_repository,
        research_favorite_repository=mock_research_favorite_repository,
    )
```

### Async Tests
- **반드시** `@pytest.mark.asyncio` 데코레이터 사용
- 메서드는 `async def`로 정의
- `await`로 service 메서드 호출

### Mock Return Values

**원칙: 실제 반환 타입에 맞게 mock 설정.**

- **`model_validate` 사용 시**: 서비스가 반환값에 `model_validate`를 호출하는 경우, **반드시 `Factory.build()` 사용** (MagicMock은 Pydantic validation에서 실패함)
- **그 외**: `MagicMock(spec=Model)` 허용 (예: `BaseRepository.create` 반환값)

```python
# Simple return
mock_repository.get.return_value = MagicMock(id=1, name="test")

# Entity 생성 반환 (None이 아닌 MagicMock(spec=Model) 사용)
mock_repository.create.return_value = MagicMock(spec=ResearchFavorite)

# Return list
mock_repository.list.return_value = [MagicMock(id=1), MagicMock(id=2)]

# Tuple return (list + pagination)
from src.schemas.common import Pagination
mock_repository.paginate.return_value = (
    [MagicMock(id=1), MagicMock(id=2)],
    Pagination(total=10, page=1, size=20, total_pages=1),
)
```

### Testing Tuple Return Values

`get_list` 등 tuple 반환 메서드 테스트:

```python
@pytest.mark.asyncio
async def test_get_list_success(
    self, service, mock_repository, mock_async_session
):
    """목록 조회 성공 테스트"""
    # Arrange
    expected_items = [MagicMock(id=1), MagicMock(id=2)]
    expected_pagination = Pagination(total=2, page=1, size=20, total_pages=1)
    mock_repository.paginate.return_value = (expected_items, expected_pagination)

    # Act
    items, pagination = await service.get_list(
        page=1,
        size=20,
        session=mock_async_session,
    )

    # Assert
    assert len(items) == 2
    assert items[0].id == 1
    assert pagination.total == 2
    assert pagination.page == 1
    mock_repository.paginate.assert_called_once()
```

### Mock Side Effects (Exceptions)
```python
mock_repository.get_or_throw.side_effect = ResearchNotFoundException(
    "Research with id 999 not found"
)
```

### Assertion Patterns
```python
# Return value assertion
assert result is None
assert result.id == expected_id
assert len(result) == expected_count

# Method called assertion
mock_repository.create.assert_called_once_with(
    research_id=research_id,
    user_id=user_id,
    session=mock_async_session,
)

# Entity 생성 호출 검증: assert_called_once() 사용 (인자 검증 불필요)
# Service가 엔티티를 직접 구성하는 경우, 내부 구현에 과도하게 결합하지 않도록
# call_args.kwargs로 필드를 개별 검증하는 것보다 assert_called_once()를 선호
mock_repository.create.assert_called_once()

# Method not called assertion
mock_repository.create.assert_not_called()

# Exception assertion
with pytest.raises(ResearchNotFoundException):
    await service.create(...)
```

## Example

```python
from unittest.mock import MagicMock

import pytest

from src.exceptions.research import ResearchNotFoundException
from src.repositories.research_favorite_repository import ResearchFavoriteRepository
from src.repositories.research_repository import ResearchRepository
from src.services.research_favorite_service import ResearchFavoriteService


class TestResearchFavoriteService:
    @pytest.fixture(scope="function")
    def mock_research_repository(self) -> MagicMock:
        return MagicMock(spec=ResearchRepository)

    @pytest.fixture(scope="function")
    def mock_research_favorite_repository(self) -> MagicMock:
        return MagicMock(spec=ResearchFavoriteRepository)

    @pytest.fixture(scope="function")
    def service(
        self,
        mock_research_repository,
        mock_research_favorite_repository,
    ) -> ResearchFavoriteService:
        return ResearchFavoriteService(
            research_repository=mock_research_repository,
            research_favorite_repository=mock_research_favorite_repository,
        )

    @pytest.mark.asyncio
    async def test_create_success(
        self,
        service,
        mock_research_repository,
        mock_research_favorite_repository,
        mock_async_session,
    ):
        """즐겨찾기 추가 성공 테스트"""
        # Arrange
        research_id = 1
        user_id = 100
        mock_research_repository.get_or_throw.return_value = MagicMock(id=research_id)
        mock_research_favorite_repository.create_if_not_exists.return_value = None

        # Act
        result = await service.create(
            research_id=research_id,
            user_id=user_id,
            session=mock_async_session,
        )

        # Assert
        assert result is None
        mock_research_repository.get_or_throw.assert_called_once_with(
            research_id, session=mock_async_session
        )
        mock_research_favorite_repository.create_if_not_exists.assert_called_once_with(
            research_id=research_id,
            user_id=user_id,
            session=mock_async_session,
        )

    @pytest.mark.asyncio
    async def test_create_research_not_found(
        self,
        service,
        mock_research_repository,
        mock_research_favorite_repository,
        mock_async_session,
    ):
        """존재하지 않는 연구에 즐겨찾기 추가 시 404"""
        # Arrange
        research_id = 999
        user_id = 100
        mock_research_repository.get_or_throw.side_effect = ResearchNotFoundException(
            f"Research with id {research_id} not found"
        )

        # Act & Assert
        with pytest.raises(ResearchNotFoundException):
            await service.create(
                research_id=research_id,
                user_id=user_id,
                session=mock_async_session,
            )

        mock_research_repository.get_or_throw.assert_called_once_with(
            research_id, session=mock_async_session
        )
        mock_research_favorite_repository.create_if_not_exists.assert_not_called()
```
