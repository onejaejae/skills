# Factory Conventions

테스트 팩토리 작성 시 참조하는 컨벤션입니다.

---

## 목적

- 테스트 데이터 생성의 일관성 유지
- 반복적인 객체 생성 코드 제거
- Model 객체와 Response 스키마 모두 지원
- 테스트 간 독립성 보장

---

## 파일 위치

```
tests/
└── factories/
    ├── research.py                  # ResearchFactory
    ├── research_design.py           # ResearchDesignFactory
    └── research_data_validation.py  # ResearchDataValidationFactory
```

---

## Factory 클래스 구조

### 기본 템플릿

```python
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.{domain} import {Domain}
from src.schemas.{domain} import {Domain}Response


class {Domain}Factory:
    """{Domain} 테스트 팩토리"""

    _counter = 0

    @classmethod
    def _next_id(cls) -> int:
        """자동 증가 ID 생성"""
        cls._counter += 1
        return cls._counter

    @classmethod
    def reset_counter(cls) -> None:
        """테스트 간 카운터 초기화"""
        cls._counter = 0

    @classmethod
    def build(cls, ...) -> {Domain}:
        """Model 객체 생성 (메모리)"""
        pass

    @classmethod
    def build_response(cls, ...) -> {Domain}Response:
        """Response 스키마 객체 생성"""
        pass

    @classmethod
    async def create(cls, session: AsyncSession, ...) -> {Domain}:
        """Model 객체 생성 + DB 저장"""
        pass
```

---

## 메서드별 용도

### build() - 메모리 객체

**용도**: Service 테스트에서 Repository mock 반환값으로 사용

**특징**:
- DB 저장 없음
- id 자동 증가 (`_next_id()` 사용)
- 모든 필드에 기본값 제공

```python
@classmethod
def build(
    cls,
    id: int | None = None,
    title: str = "Test Research",
    project_id: int | None = None,
    created_by_id: int = 1,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> Research:
    """Research Model 객체 생성 (메모리)"""
    _id = id if id is not None else cls._next_id()
    now = datetime.now()
    return Research(
        id=_id,
        code=f"RA{_id}",  # computed column 시뮬레이션
        title=title,
        project_id=project_id,
        created_by_id=created_by_id,
        created_at=created_at or now,
        updated_at=updated_at or now,
    )
```

**사용 예시**:

```python
# Service 테스트
mock_research = ResearchFactory.build(id=1, title="My Research")
mock_repository.get.return_value = mock_research
```

---

### build_response() - Response 스키마

**용도**: Controller 테스트에서 Service mock 반환값으로 사용

**특징**:
- Pydantic 스키마 객체 반환
- 모든 필드에 기본값 제공

```python
@classmethod
def build_response(
    cls,
    id: int | None = None,
    title: str = "Test Research",
    project_id: int | None = None,
    created_by_id: int = 1,
    status: ResearchStatus = ResearchStatus.IN_PROGRESS,
    created_at: datetime | None = None,
    updated_at: datetime | None = None,
) -> ResearchResponse:
    """ResearchResponse 스키마 객체 생성"""
    _id = id if id is not None else cls._next_id()
    now = datetime.now()
    return ResearchResponse(
        id=_id,
        code=f"RA{_id}",
        title=title,
        project_id=project_id,
        created_by_id=created_by_id,
        status=status,
        created_at=created_at or now,
        updated_at=updated_at or now,
    )
```

**사용 예시**:

```python
# Controller 테스트
mock_response = ResearchFactory.build_response(id=1, title="My Research")
mock_service.get.return_value = mock_response
```

---

### create() - DB 저장

**용도**: Repository 통합 테스트에서 실제 DB에 데이터 생성

**특징**:
- `AsyncSession` 필수 파라미터
- `session.flush()` 호출로 즉시 반영
- **id, code는 지정하지 않음** (DB에서 자동 생성)

```python
@classmethod
async def create(
    cls,
    session: AsyncSession,
    title: str = "Test Research",
    project_id: int | None = None,
    created_by_id: int = 1,
    status: str = ResearchStatus.IN_PROGRESS.value,
) -> Research:
    """Research Model 객체 생성 + DB 저장 (Repository 테스트용)

    Note: id와 code는 DB에서 자동 생성 (autoincrement, generated column)
    """
    obj = Research(
        chat_session_id=uuid4(),
        title=title,
        project_id=project_id,
        created_by_id=created_by_id,
        updated_by_id=created_by_id,
        status=status,
    )
    session.add(obj)
    await session.flush()
    return obj
```

**사용 예시**:

```python
# Repository 테스트
@pytest.mark.asyncio
async def test_get(self, repository, async_session):
    # Arrange - 실제 DB에 데이터 생성
    research = await ResearchFactory.create(
        async_session,
        title="Test Research",
    )

    # Act
    result = await repository.get(research.id, session=async_session)

    # Assert
    assert result.title == "Test Research"
```

---

## 카운터 관리

### _counter 클래스 변수

```python
_counter = 0

@classmethod
def _next_id(cls) -> int:
    """자동 증가 ID 생성"""
    cls._counter += 1
    return cls._counter
```

### reset_counter()

테스트 간 독립성을 위해 카운터 초기화가 필요할 수 있습니다.

```python
@classmethod
def reset_counter(cls) -> None:
    """테스트 간 카운터 초기화"""
    cls._counter = 0
```

**사용 예시** (conftest.py):

```python
@pytest.fixture(autouse=True)
def reset_factories():
    """각 테스트 전 팩토리 카운터 초기화"""
    ResearchFactory.reset_counter()
    ResearchDesignFactory.reset_counter()
    yield
```

---

## Generated Column 주의사항

### 문제

SQLAlchemy의 `Computed` 컬럼 (예: `code = "RA" + id`)은 DB에서 자동 생성됩니다.
`create()` 메서드에서 id를 직접 지정하면 에러가 발생합니다.

### 해결

`create()` 메서드에서는 **id와 computed column을 지정하지 않습니다**.

```python
# 올바른 방법
obj = Research(
    # id 생략 (autoincrement)
    # code 생략 (generated column)
    title=title,
    ...
)
session.add(obj)
await session.flush()  # 여기서 id와 code가 DB에서 생성됨
return obj
```

### build() vs create()

| 메서드 | id 지정 | code 지정 |
|--------|---------|-----------|
| `build()` | O (메모리) | O (시뮬레이션) |
| `create()` | X (DB 자동) | X (DB 자동) |

---

## JSONB 필드 처리

JSONB 컬럼은 빈 리스트 또는 딕셔너리를 기본값으로 설정합니다.

```python
@classmethod
def build(
    cls,
    id: int | None = None,
    research_id: int = 1,
    condition_codes: list[dict] | None = None,
    medication_codes: list[dict] | None = None,
    ...
) -> ResearchDataValidation:
    _id = id if id is not None else cls._next_id()
    return ResearchDataValidation(
        id=_id,
        research_id=research_id,
        condition_codes=condition_codes or [],  # 기본값: 빈 리스트
        medication_codes=medication_codes or [],
        ...
    )
```

---

## 테스트 유형별 Factory 사용

### Controller 테스트

```python
class TestResearchController:
    def test_get_research(self, test_client, mock_research_service):
        # build_response() 사용
        mock_response = ResearchFactory.build_response(id=1)
        mock_research_service.get.return_value = mock_response

        response = test_client.get("/api/researches/1")
        assert response.status_code == 200
```

### Service 테스트

```python
class TestResearchService:
    async def test_get(self, service, mock_repository, mock_session):
        # build() 사용
        mock_research = ResearchFactory.build(id=1)
        mock_repository.get.return_value = mock_research

        result = await service.get(1, session=mock_session)
        assert isinstance(result, ResearchResponse)
```

### Repository 테스트

```python
class TestResearchRepository:
    async def test_get(self, repository, async_session):
        # create() 사용 (실제 DB)
        research = await ResearchFactory.create(
            async_session, title="Test"
        )

        result = await repository.get(research.id, session=async_session)
        assert result.title == "Test"
```

---

## 체크리스트

### Factory 클래스 생성 시

- [ ] `_counter` 클래스 변수 정의
- [ ] `_next_id()` 메서드 구현
- [ ] `reset_counter()` 메서드 구현
- [ ] `build()` 메서드 구현 (메모리 객체)
- [ ] `build_response()` 메서드 구현 (Response가 있는 경우)
- [ ] `create()` 메서드 구현 (DB 저장)
- [ ] Generated column은 `create()`에서 생략
- [ ] JSONB 필드는 기본값으로 빈 리스트/딕셔너리 설정
