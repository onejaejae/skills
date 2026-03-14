# Repository Test Conventions

## Structure

```python
import pytest
from sqlalchemy import select

from src.models.{feature} import {Model}
from src.repositories.{feature}_repository import {Feature}Repository
from src.repositories.{dependency}_repository import {Dependency}Repository


class Test{Feature}Repository:
    """{Feature}Repository 클래스 테스트"""

    @pytest.fixture
    def repository(self):
        return {Feature}Repository()

    @pytest.fixture
    async def test_{entity}(self, async_session):
        """테스트용 {entity} 생성"""
        entity = await {Entity}Factory.create(async_session, **create_kwargs)
        return entity

    @pytest.mark.asyncio
    async def test_{method}_success(
        self, repository, test_{entity}, async_session
    ):
        """성공 테스트 - 한글로"""
        # Arrange
        entity_id = test_{entity}.id

        # Act
        result = await repository.{method}(
            **kwargs,
            session=async_session,
        )

        # Assert
        assert result is expected
```

## Key Points

### 테스트 대상 범위
- **자식 Repository에서 정의한 custom 메서드만 테스트** (예: `get_by_research_and_user`, `delete_by_research_and_user`)
- **상속된 `BaseRepository` 메서드는 테스트하지 않음** (예: `create`, `get`, `hard_delete` 등은 `test_base_repository.py`에서 이미 검증됨)
- Repository 클래스를 열어 `def` 키워드로 정의된 메서드만 테스트 대상

### Fixtures
- `async_session`: conftest.py에서 제공하는 실제 DB 세션
- `setup_tables`: 클래스 스코프로 테이블 생성/정리 (자동 적용됨)
- Repository 인스턴스는 클래스 내부에서 fixture로 정의
- 테스트용 데이터도 fixture로 정의

### Real Database Tests
- Repository 테스트는 **실제 DB** 사용
- 트랜잭션은 테스트 후 자동 롤백됨
- 테스트 데이터는 fixture로 생성

### Test Data Fixtures
```python
@pytest.fixture
def repository(self):
    return ResearchFavoriteRepository()

@pytest.fixture
async def test_research(self, async_session):
    """테스트용 연구 생성"""
    research = await ResearchFactory.create(
        async_session,
        title="테스트 연구",
        project_id=None,
        created_by_id=1,
    )
    return research
```

### Async Tests
- **반드시** `@pytest.mark.asyncio` 데코레이터 사용
- 메서드는 `async def`로 정의
- `await`로 repository 메서드 호출

### Edge Case: 복합 UniqueConstraint
모델에 복합 `UniqueConstraint`가 있으면 (예: `(research_id, user_id)`), 반드시 **다중 행위자 edge case 테스트** 포함:

```python
@pytest.mark.asyncio
async def test_different_users_can_favorite_same_research(
    self, repository, test_research, async_session
):
    """다른 사용자가 같은 연구를 즐겨찾기할 수 있음"""
    research_id = test_research.id
    await self._create_favorite(repository, async_session, research_id, user_id=700)
    await self._create_favorite(repository, async_session, research_id, user_id=701)
    exists_1 = await self._favorite_exists(async_session, research_id, user_id=700)
    exists_2 = await self._favorite_exists(async_session, research_id, user_id=701)
    assert exists_1 is True
    assert exists_2 is True
```

### 테스트 네이밍
결과를 설명하는 이름 사용 (`success`/`failure` 대신):
- `test_get_by_research_and_user_returns_favorite` (O)
- `test_get_by_research_and_user_returns_none_when_not_exists` (O)
- `test_delete_by_research_and_user_does_nothing_when_not_exists` (O)
- `test_get_by_research_and_user_success` (X - 결과가 불명확)

### Assertion Patterns
```python
# Boolean assertion
assert result is True
assert result is False

# Existence check
exists = await repository.exists(id=entity_id, session=async_session)
assert exists is True

# Query result check
result = await repository.get(id=entity_id, session=async_session)
assert result is not None
assert result.id == entity_id
```

### Private Helper Methods

테스트 클래스 내에서 반복되는 로직은 private helper method로 추출:

```python
class TestResearchFavoriteRepository:
    # ... fixtures ...

    async def _create_favorite(
        self, repository, async_session, research_id: int, user_id: int
    ) -> ResearchFavorite:
        """테스트용 즐겨찾기 생성 helper"""
        favorite = ResearchFavorite(research_id=research_id, user_id=user_id)
        return await repository.create(entity=favorite, session=async_session)

    async def _favorite_exists(
        self, async_session, research_id: int, user_id: int
    ) -> bool:
        """테스트용 즐겨찾기 존재 여부 확인 helper"""
        stmt = select(ResearchFavorite.id).where(
            ResearchFavorite.research_id == research_id,
            ResearchFavorite.user_id == user_id,
        )
        result = await async_session.execute(stmt)
        return result.scalar_one_or_none() is not None

    @pytest.mark.asyncio
    async def test_create_favorite(self, repository, test_research, async_session):
        """즐겨찾기 생성 테스트"""
        # Arrange
        research_id = test_research.id
        user_id = 100

        # Act
        favorite = await self._create_favorite(
            repository, async_session, research_id, user_id
        )

        # Assert
        assert favorite is not None
        exists = await self._favorite_exists(async_session, research_id, user_id)
        assert exists is True
```

**Helper method 명명 규칙:**
- `_create_{entity}`: 테스트용 엔티티 생성
- `_{entity}_exists`: 존재 여부 확인
- `_get_{entity}`: 엔티티 조회

## Example

```python
import pytest

from src.repositories.research_favorite_repository import ResearchFavoriteRepository
from src.repositories.research_repository import ResearchRepository


class TestResearchFavoriteRepository:
    """ResearchFavoriteRepository 클래스 테스트"""

    @pytest.fixture
    def repository(self):
        return ResearchFavoriteRepository()

    @pytest.fixture
    async def test_research(self, async_session):
        """테스트용 연구 생성"""
        research = await ResearchFactory.create(
            async_session,
            title="테스트 연구",
            project_id=None,
            created_by_id=1,
        )
        return research

    @pytest.mark.asyncio
    async def test_create_if_not_exists_creates_favorite(
        self, repository, test_research, async_session
    ):
        """즐겨찾기 생성 테스트"""
        # Arrange
        research_id = test_research.id
        user_id = 100

        # Act
        await repository.create_if_not_exists(
            research_id=research_id,
            user_id=user_id,
            session=async_session,
        )

        # Assert
        exists = await repository.exists(
            research_id=research_id,
            user_id=user_id,
            session=async_session,
        )
        assert exists is True

    @pytest.mark.asyncio
    async def test_create_if_not_exists_is_idempotent(
        self, repository, test_research, async_session
    ):
        """즐겨찾기 생성 멱등성 테스트 - 중복 생성해도 에러 없음"""
        # Arrange
        research_id = test_research.id
        user_id = 200

        # Act - 두 번 생성 시도
        await repository.create_if_not_exists(
            research_id=research_id,
            user_id=user_id,
            session=async_session,
        )
        await repository.create_if_not_exists(
            research_id=research_id,
            user_id=user_id,
            session=async_session,
        )

        # Assert - 에러 없이 성공
        exists = await repository.exists(
            research_id=research_id,
            user_id=user_id,
            session=async_session,
        )
        assert exists is True

    @pytest.mark.asyncio
    async def test_exists_returns_false_when_not_exists(
        self, repository, test_research, async_session
    ):
        """즐겨찾기 미존재 시 False 반환"""
        # Arrange
        research_id = test_research.id
        user_id = 600

        # Act
        result = await repository.exists(
            research_id=research_id,
            user_id=user_id,
            session=async_session,
        )

        # Assert
        assert result is False
```
