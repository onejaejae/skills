---
name: code-standards
description: >
  코드 구현 및 테스트 작성 표준. 파일 구조, 네이밍 컨벤션, 테스트 패턴, 커밋 컨벤션을 정의합니다.
  Use when implementing features, writing tests, or making commits.
---

# Code Standards

코드 구현 및 테스트 작성 시 참조하는 표준입니다.

---

## 파일 구조

```
src/
├── main.py                          # FastAPI 앱 팩토리
├── settings.py                      # Pydantic 설정 관리
├── containers.py                    # DI 컨테이너 (dependency-injector)
├── database.py                      # DB 세션 관리 (async)
│
├── controllers/                     # HTTP 라우트 핸들러
│   └── {domain}.py                 # {domain}_router (복수형)
│
├── services/                        # 비즈니스 로직
│   └── {domain}_service.py         # {Domain}Service (단수형)
│
├── repositories/                    # 데이터 접근 계층
│   └── {domain}_repository.py      # {Domain}Repository (단수형)
│
├── models/                          # SQLAlchemy ORM 모델
│   ├── base.py                     # BaseModel, TimestampMixin
│   └── {domain}.py                 # {Domain} (테이블 모델)
│
├── schemas/                         # Pydantic DTO
│   ├── common.py                   # CommonResponse, Meta
│   ├── error.py                    # ErrorResponse, ErrorSchema
│   └── {domain}.py                 # {Domain}Create, {Domain}Response
│
├── exceptions/                      # 예외 정의
│   ├── common.py                   # 기본 예외 클래스 계층
│   └── {domain}.py                 # 도메인 예외
│
├── enums/                           # 열거형 정의
│   └── {domain}.py                 # Enum 정의
│
└── utils/                           # 유틸리티
    └── auth.py                     # JWT 인증 (RequireAuth, CurrentUserId)

tests/
├── conftest.py                      # 공통 fixtures
├── controllers/
│   └── test_{domain}_controller.py
├── services/
│   └── test_{domain}_service.py
└── repositories/
    └── test_{domain}_repository.py
```

## 네이밍 컨벤션

| 유형 | 컨벤션 | 예시 |
|------|--------|------|
| 파일명 | snake_case | `research_repository.py` |
| 클래스 | PascalCase | `ResearchRepository` |
| 함수/메서드 | snake_case | `get_or_throw` |
| 변수 | snake_case | `research_id` |
| 상수 | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| 라우터 | snake_case + 복수 | `research_router` |
| 라우트 경로 | kebab-case | `/api/researches` |

### 계층별 네이밍

| 계층 | 파일명 | 클래스명 | 변수명 |
|------|--------|----------|--------|
| Controller | `research.py` | - | `research_router` |
| Service | `research_service.py` | `ResearchService` | `research_service` |
| Repository | `research_repository.py` | `ResearchRepository` | `research_repository` |
| Model | `research.py` | `Research` | `research` |
| Schema | `research.py` | `ResearchCreate`, `ResearchResponse` | - |
| Exception | `research.py` | `ResearchNotFoundException` | - |

---

## 테스트 패턴

### 테스트 케이스 분류

| 유형 | 설명 | 예시 |
|------|------|------|
| Happy Path | 정상 동작 | 유효한 데이터로 생성 성공 |
| Edge Cases | 경계값 | 빈 문자열, 최대 길이 |
| Error Cases | 예상 실패 | 존재하지 않는 ID, 중복 데이터 |

### 테스트 구조 (AAA 패턴)

```python
class TestResearchService:
    @pytest.fixture(scope="function")
    def mock_research_repository(self) -> MagicMock:
        return MagicMock(spec=ResearchRepository)

    @pytest.fixture(scope="function")
    def service(self, mock_research_repository) -> ResearchService:
        return ResearchService(
            research_repository=mock_research_repository,
        )

    @pytest.mark.asyncio
    async def test_get(
        self,
        service,
        mock_research_repository,
        mock_async_session,
    ):
        # Arrange
        research_id = 1
        mock_research = Research(
            id=research_id,
            chat_session_id=uuid4(),
            title="Test Research",
            project_id=1,
            created_by_id=1,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        mock_research_repository.get_or_throw.return_value = mock_research

        # Act
        result = await service.get(research_id, session=mock_async_session)

        # Assert
        assert isinstance(result, ResearchResponse)
        assert result.id == research_id
        assert result.title == "Test Research"
        mock_research_repository.get_or_throw.assert_called_once_with(
            research_id, session=mock_async_session
        )

    @pytest.mark.asyncio
    async def test_get_not_found(
        self,
        service,
        mock_research_repository,
        mock_async_session,
    ):
        # Arrange
        mock_research_repository.get_or_throw.side_effect = ResearchNotFoundException()

        # Act & Assert
        with pytest.raises(ResearchNotFoundException):
            await service.get(1, session=mock_async_session)
```

### 모킹 패턴

```python
# tests/conftest.py
@pytest.fixture(scope="session")
def mock_async_session() -> MagicMock:
    return MagicMock(spec=AsyncSession)

@pytest.fixture(scope="session")
def mock_current_user_id() -> int:
    return 1

@pytest.fixture(scope="session")
def app(
    mock_async_session, mock_async_connection, mock_current_user_id
) -> Generator[FastAPI, Any, None]:
    from src.main import create_app
    _app = create_app()

    # 데이터베이스 관련 mocking
    _app.dependency_overrides[database.get_async_session] = lambda: mock_async_session
    _app.dependency_overrides[require_auth] = lambda: None
    _app.dependency_overrides[get_current_user_id] = lambda: mock_current_user_id

    yield _app

@pytest.fixture(autouse=True)
def mock_services(app) -> Generator[dict[str, MagicMock], None, None]:
    container = app.container
    service_specs = {
        "research_service": ResearchService,
    }
    mocks = {}

    for name, cls in service_specs.items():
        mock = MagicMock(spec=cls)
        getattr(container, name).override(mock)
        mocks[name] = mock

    yield mocks

    for name in service_specs:
        getattr(container, name).reset_override()
```

### Controller 테스트 패턴

```python
class TestResearchController:
    TEST_API_PREFIX = "/api/researches"

    @pytest.fixture
    def mock_research_service(self, mock_services):
        return mock_services["research_service"]

    def test_get_research(self, test_client, mock_research_service, mock_async_session):
        # Arrange
        research_id = 1
        mock_research = ResearchResponse(
            id=research_id,
            chat_session_id=uuid4(),
            title="Test Research",
            project_id=1,
            created_by_id=1,
            updated_by_id=1,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )
        mock_research_service.get.return_value = mock_research

        # Act
        response = test_client.get(f"{self.TEST_API_PREFIX}/{research_id}")

        # Assert
        assert response.status_code == status.HTTP_200_OK
        mock_research_service.get.assert_called_once_with(
            research_id, session=mock_async_session
        )
```

### Repository 테스트 패턴

Repository 테스트는 **실제 DB**를 사용하는 통합 테스트입니다.

```python
class TestResearchRepository:
    @pytest.fixture
    def repository(self):
        return ResearchRepository()

    @pytest.fixture
    async def test_research(self, repository, async_session):
        """테스트용 데이터 생성"""
        return await repository.create(
            title="테스트 연구",
            project_id=1,
            created_by_id=1,
            session=async_session,
        )

    @pytest.mark.asyncio
    async def test_create(self, repository, async_session):
        # Arrange
        title = "새로운 연구"

        # Act
        result = await repository.create(title=title, ..., session=async_session)

        # Assert
        assert result.title == title
```

#### 필터 테스트 원칙

필터 테스트는 **포함될 데이터 + 제외될 데이터** 모두 검증:

```python
@pytest.mark.asyncio
async def test_get_list_filter(self, repository, async_session):
    # Arrange - 포함될 데이터 + 제외될 데이터
    included = await repository.create(project_id=10, ...)  # 포함
    excluded = await repository.create(project_id=20, ...)  # 제외

    # Act
    items, _ = await repository.get_list(project_id=10, ...)

    # Assert - 양쪽 모두 검증
    result_ids = [item.id for item in items]
    assert included.id in result_ids      # 포함 확인
    assert excluded.id not in result_ids  # 제외 확인
```

#### 정렬 테스트 (명시적 시간값)

PostgreSQL `now()`는 트랜잭션 시작 시간을 반환하므로 명시적 값 사용:

```python
@pytest.mark.asyncio
async def test_sort_by_created_at(self, repository, async_session):
    # Arrange - 명시적 시간값
    older = Research(created_at=datetime(2024, 1, 1), ...)
    newer = Research(created_at=datetime(2024, 1, 2), ...)
    async_session.add_all([older, newer])
    await async_session.flush()

    # Act
    items, _ = await repository.get_list(sort="-created_at", ...)

    # Assert
    assert items[0].id == newer.id  # 최신순
```

---

## 커밋 컨벤션

### 형식

CLAUDE.md의 Conventional Commits 기반:

```
타입(적용범위): task_id 설명 #버전태그
```

### 타입

| Type | Description |
|------|-------------|
| feat | 기능 추가 |
| fix | 버그 수정 |
| improve | 현재 구현체 개선 |
| refactor | 내부 리팩토링 |
| docs | 문서 |
| test | 테스트 코드 |
| style | 포맷팅 |
| chore | 기타 수정 |
| package | 패키지 업데이트 |

### 버전 태그

| 태그 | 설명 | 버전 변화 |
|------|------|----------|
| #patch | 버그 수정 | 1.0.0 -> 1.0.1 (기본값) |
| #minor | 새로운 기능 | 1.0.0 -> 1.1.0 |
| #major | 호환성 깨지는 변경 | 1.0.0 -> 2.0.0 |

### 규칙

- Conventional Commits 형식 사용 (CLAUDE.md 참조)
- task_id는 Notion task ID (DPT-XXXXX)
- 버전 태그 필수
- PR 번호는 GitHub에서 자동 추가됨

### 예시

```
feat(research): DPT-10246 연구 지원 API 구현 #minor
fix(chat): DPT-10309 SSE 스트리밍 모드 구분 #patch
[HOTFIX] 메세지 테이블 마이그레이션 트랜잭션 분리 #patch
```

### 특수 커밋

- `[HOTFIX]`: 긴급 패치 (Conventional Commits 형식 예외)

---

## 타입 힌팅 스타일

### Python 3.13+ 스타일

```python
# 권장 (Python 3.13+)
def get(self, id: int) -> Research | None:
    pass

# 비권장 (Optional 사용)
def get(self, id: int) -> Optional[Research]:
    pass
```

### keyword-only 인자

```python
# Repository/Service 메서드
async def create(
    self,
    *,  # 이 아래는 모두 키워드 전용
    title: str,
    project_id: int | None,
    created_by_id: int,
    session: AsyncSession,
) -> Research:
    pass
```

### Annotated DI 패턴

```python
# Controller 의존성 주입
async def get_research(
    _: RequireAuth,
    research_id: Annotated[int, Path(title="연구 ID")],
    session: Annotated[AsyncSession, Depends(database.get_async_session)],
    service: Annotated[ResearchService, Depends(Provide[Container.research_service])],
) -> CommonResponse[ResearchResponse, Meta]:
    pass
```

---

## Quick Reference

### 테스트 케이스 필수 항목

```python
class TestServiceName:
    @pytest.mark.asyncio
    async def test_method_success(self, ...):
        """Happy Path - 정상 동작"""
        pass

    @pytest.mark.asyncio
    async def test_method_not_found(self, ...):
        """Error Case - 리소스 없음"""
        pass
```

### 커밋 메시지 템플릿

```
feat(domain): DPT-XXXXX 기능 설명 #minor
fix(domain): DPT-XXXXX 버그 수정 설명 #patch
[HOTFIX] 긴급 수정 설명 #patch
```

### 체크리스트

- [ ] 파일이 계층별 디렉토리에 정리되었는가? (controllers/, services/, repositories/)
- [ ] 네이밍이 컨벤션을 따르는가? (snake_case 파일, PascalCase 클래스)
- [ ] 테스트가 Happy/Edge/Error 케이스를 커버하는가?
- [ ] 커밋 메시지가 `타입(적용범위): task_id 설명 #버전태그` 형식인가?
- [ ] @pytest.mark.asyncio 데코레이터가 있는가?
- [ ] AAA 패턴 (Arrange-Act-Assert)을 따르는가?
- [ ] MagicMock(spec=ClassName)으로 타입 검증하는가?
