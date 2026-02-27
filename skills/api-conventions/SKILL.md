---
name: api-conventions
description: >
  RESTful API 설계 컨벤션. URL 설계, HTTP 메서드, 상태 코드, Response 형식, 에러 코드를 정의합니다.
  Use when designing API endpoints, implementing controllers, or reviewing API implementations.
---

# API Conventions

API 설계 시 참조하는 컨벤션입니다.

---

## URL 설계

```
/api/{resource}           # 복수형 명사 (버전 없음)
/api/{resource}/{id}      # 단일 리소스
```

### 예시

| 동작 | URL | HTTP 메서드 |
|------|-----|------------|
| 목록 조회 | `/api/researches` | GET |
| 단일 조회 | `/api/researches/{research_id}` | GET |
| 생성 | `/api/researches` | POST |
| 수정 | `/api/researches/{research_id}` | PATCH |
| 삭제 | `/api/researches/{research_id}` | DELETE |

## HTTP 메서드

| 메서드 | 용도 | 상태코드 |
|--------|------|----------|
| GET | 조회 | 200 |
| POST | 생성 | 201 |
| PATCH | 수정 | 200 |
| DELETE | 삭제 | 200 또는 204 |

## HTTP 상태 코드

| 코드 | 의미 |
|------|------|
| 200 | OK (조회/수정 성공) |
| 201 | Created (생성 성공) |
| 400 | Bad Request (유효성 검사 실패) |
| 401 | Unauthorized (인증 필요) |
| 403 | Forbidden (권한 없음) |
| 404 | Not Found (리소스 없음) |
| 409 | Conflict (중복) |
| 500 | Internal Server Error |

---

## Response 형식

### 성공

```python
# 스키마 정의 (src/schemas/common.py)
class Meta(BaseModel):
    pass

class CommonResponse(BaseModel, Generic[T, M]):
    data: T
    meta: M
```

```json
{
  "data": { ... },
  "meta": {}
}
```

### 에러

```python
# 스키마 정의 (src/schemas/error.py)
class ErrorSchema(BaseModel):
    status_code: int
    message: str
    error_code: str

class ErrorResponse(BaseModel):
    error: ErrorSchema
```

```json
{
  "error": {
    "status_code": 404,
    "message": "Research with id 1 not found",
    "error_code": "RESEARCH_NOT_FOUND"
  }
}
```

## 에러 코드 형식

`{DOMAIN}_{ERROR_TYPE}`

예시:
- `AUTH_INVALID_CREDENTIALS` - 인증 실패
- `AUTH_TOKEN_EXPIRED` - 토큰 만료
- `RESEARCH_NOT_FOUND` - 연구 없음
- `VALIDATION_ERROR` - 입력값 검증 실패

### 예외 클래스 매핑

| HTTP 상태 | 예외 클래스 | 사용 예시 |
|-----------|-------------|-----------|
| 400 | ValidationCommonException | 입력값 검증 실패 |
| 401 | UnauthorizedCommonException | 인증 실패 |
| 403 | PermissionCommonException | 권한 없음 |
| 404 | NotFoundCommonException | 리소스 없음 |
| 503 | ServiceUnavailableCommonException | 외부 서비스 장애 |

### 도메인별 예외 정의

```python
# src/exceptions/research.py
from src.exceptions.common import NotFoundCommonException

class ResearchNotFoundException(NotFoundCommonException):
    pass
```

---

## FastAPI 구현 패턴

### Controller

```python
# src/controllers/research.py
from typing import Annotated

from dependency_injector.wiring import Provide, inject
from fastapi import APIRouter, Body, Depends, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.containers import Container
from src.database import database
from src.schemas.common import CommonResponse, Meta
from src.schemas.error import COMMON_ERROR_RESPONSES
from src.schemas.research import ResearchCreate, ResearchResponse
from src.services.research_service import ResearchService
from src.utils.auth import CurrentUserId, RequireAuth

research_router = APIRouter(prefix="/api/researches", tags=["Research"])


@research_router.get(
    "/{research_id}",
    summary="연구 조회 API",
    description="특정 연구 정보를 조회합니다.",
    status_code=status.HTTP_200_OK,
    responses=COMMON_ERROR_RESPONSES,
)
@inject
async def get_research(
    _: RequireAuth,
    research_id: Annotated[
        int, Path(title="연구 ID", description="조회할 연구의 고유 식별자")
    ],
    session: Annotated[AsyncSession, Depends(database.get_async_session)],
    service: Annotated[ResearchService, Depends(Provide[Container.research_service])],
) -> CommonResponse[ResearchResponse, Meta]:
    result = await service.get(research_id, session=session)
    return CommonResponse(data=result, meta=Meta())


@research_router.post(
    "",
    summary="연구 생성 API",
    status_code=status.HTTP_201_CREATED,
    responses=COMMON_ERROR_RESPONSES,
)
@inject
async def create_research(
    user_id: CurrentUserId,
    request: Annotated[ResearchCreate, Body()],
    session: Annotated[AsyncSession, Depends(database.get_async_session)],
    service: Annotated[ResearchService, Depends(Provide[Container.research_service])],
) -> CommonResponse[ResearchResponse, Meta]:
    result = await service.create(
        title=request.title,
        project_id=request.project_id,
        created_by_id=user_id,
        session=session,
    )
    return CommonResponse(data=result, meta=Meta())
```

### Service

```python
# src/services/research_service.py
from sqlalchemy.ext.asyncio import AsyncSession

from src.repositories.research_repository import ResearchRepository
from src.schemas.research import ResearchResponse


class ResearchService:
    def __init__(
        self,
        *,
        research_repository: ResearchRepository,
    ):
        self.research_repository = research_repository

    async def get(self, research_id: int, *, session: AsyncSession) -> ResearchResponse:
        research = await self.research_repository.get_or_throw(
            research_id, session=session
        )
        return ResearchResponse.model_validate(research)
```

### Schema (Pydantic DTO)

```python
# src/schemas/research.py
from pydantic import BaseModel, ConfigDict, Field

from src.schemas.common import TimestampInfo


# Request
class ResearchCreate(BaseModel):
    title: str = Field(..., description="연구 제목")
    project_id: int | None = Field(None, description="프로젝트 ID")


class ResearchUpdate(BaseModel):
    title: str = Field(..., description="연구 제목")


# Response
class ResearchResponse(TimestampInfo):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="연구 ID")
    title: str = Field(..., description="연구 제목")
    project_id: int | None = Field(None, description="프로젝트 ID")
    created_by_id: int | None = Field(None, description="생성자 ID")
```

### Repository

```python
# src/repositories/research_repository.py
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions.research import ResearchNotFoundException
from src.models.research import Research


class ResearchRepository:
    async def get(self, research_id: int, *, session: AsyncSession) -> Research | None:
        stmt = select(Research).where(
            Research.id == research_id,
            Research.deleted_at.is_(None),  # Soft Delete 필터
        )
        result = await session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_or_throw(
        self,
        research_id: int,
        *,
        session: AsyncSession,
    ) -> Research:
        research = await self.get(research_id, session=session)
        if research is None:
            raise ResearchNotFoundException(f"Research with id {research_id} not found")
        return research
```

---

## Quick Reference

### Response 템플릿

```python
# 성공
CommonResponse(data=result, meta=Meta())

# 에러 (자동 처리)
raise ResearchNotFoundException(f"Research with id {id} not found")
```

### 인증 패턴

```python
# 인증만 필요 (사용자 ID 불필요)
_: RequireAuth

# 사용자 ID 필요
user_id: CurrentUserId
```

### 체크리스트

- [ ] URL이 복수형 명사인가? (`/api/researches`)
- [ ] HTTP 메서드가 적절한가? (GET/POST/PATCH/DELETE)
- [ ] 상태 코드가 올바른가? (GET 200, POST 201, DELETE 204)
- [ ] Response 형식이 `CommonResponse[T, Meta]` 인가?
- [ ] `responses=COMMON_ERROR_RESPONSES` 포함되었는가?
- [ ] `@inject` 데코레이터가 있는가?
- [ ] 의존성이 `Annotated[Type, Depends(...)]` 형식인가?
