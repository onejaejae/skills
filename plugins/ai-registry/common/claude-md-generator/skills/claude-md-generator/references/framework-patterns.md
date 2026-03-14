# 프레임워크별 CLAUDE.md 패턴

## 목차
1. [Frontend 프레임워크](#1-frontend-프레임워크)
2. [Backend 프레임워크](#2-backend-프레임워크)
3. [Fullstack 프레임워크](#3-fullstack-프레임워크)

---

## 1. Frontend 프레임워크

### React

**감지 조건:**
- `package.json`에 `react` 의존성
- `src/` 또는 `app/` 디렉토리에 `.jsx`, `.tsx` 파일

**추가 섹션:**

```markdown
## 컴포넌트 규칙

### 파일 구조
```
src/components/
├── Button/
│   ├── Button.tsx        # 컴포넌트
│   ├── Button.styles.ts  # 스타일 (styled-components/emotion)
│   ├── Button.test.tsx   # 테스트
│   └── index.ts          # re-export
```

### 컴포넌트 작성 가이드
- 함수형 컴포넌트 + Hooks 사용
- Props는 인터페이스로 정의
- children prop 타입: `React.ReactNode`

### 네이밍
- 컴포넌트 파일: PascalCase (`UserProfile.tsx`)
- 훅 파일: camelCase with `use` prefix (`useAuth.ts`)
- 유틸 파일: camelCase (`formatDate.ts`)

## 상태 관리

{state-management-library}를 사용합니다.

### 전역 상태
- 인증 정보
- 사용자 설정
- 테마

### 로컬 상태
- 폼 입력
- UI 토글
- 임시 데이터
```

### Vue

**감지 조건:**
- `package.json`에 `vue` 의존성
- `.vue` 파일 존재

**추가 섹션:**

```markdown
## 컴포넌트 규칙

### 파일 구조
```
src/components/
├── BaseButton.vue        # 기본 컴포넌트
├── TheHeader.vue         # 싱글톤 컴포넌트
└── UserProfile/
    ├── UserProfile.vue
    └── UserProfileCard.vue
```

### 컴포넌트 작성 가이드
- Composition API (`<script setup>`) 사용
- Props는 defineProps로 타입 정의
- Emit은 defineEmits로 정의

### 네이밍
- 컴포넌트: PascalCase (`UserProfile.vue`)
- 기본 컴포넌트: `Base` prefix (`BaseButton.vue`)
- 싱글톤 컴포넌트: `The` prefix (`TheHeader.vue`)

## 상태 관리

Pinia를 사용합니다.

### Store 구조
```typescript
// stores/user.ts
export const useUserStore = defineStore('user', () => {
  const user = ref<User | null>(null)
  const isLoggedIn = computed(() => !!user.value)

  async function login(credentials: Credentials) { ... }

  return { user, isLoggedIn, login }
})
```
```

### Angular

**감지 조건:**
- `package.json`에 `@angular/core` 의존성
- `angular.json` 파일 존재

**추가 섹션:**

```markdown
## 컴포넌트 규칙

### 파일 구조
```
src/app/
├── core/              # 싱글톤 서비스, 가드
├── shared/            # 공유 컴포넌트, 파이프, 디렉티브
└── features/          # 피처 모듈
    └── user/
        ├── user.module.ts
        ├── user.component.ts
        ├── user.component.html
        └── user.service.ts
```

### 컴포넌트 작성 가이드
- Standalone 컴포넌트 권장
- OnPush 변경 감지 전략 사용
- 의존성 주입은 inject() 함수 사용

### 네이밍
- 컴포넌트: `feature.component.ts`
- 서비스: `feature.service.ts`
- 파이프: `feature.pipe.ts`
- 디렉티브: `feature.directive.ts`

## 상태 관리

NgRx를 사용합니다.

### Store 구조
- Actions: `store/actions/*.actions.ts`
- Reducers: `store/reducers/*.reducer.ts`
- Effects: `store/effects/*.effects.ts`
- Selectors: `store/selectors/*.selectors.ts`
```

---

## 2. Backend 프레임워크

### FastAPI (Python)

**감지 조건:**
- `pyproject.toml` 또는 `requirements.txt`에 `fastapi`

**추가 섹션:**

```markdown
## API 가이드

### 엔드포인트 구조
```
app/
├── api/
│   └── v1/
│       ├── endpoints/
│       │   ├── users.py
│       │   └── items.py
│       └── router.py
├── models/           # SQLAlchemy 모델
├── schemas/          # Pydantic 스키마
└── services/         # 비즈니스 로직
```

### 라우터 작성
```python
from fastapi import APIRouter, Depends, HTTPException

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: Session = Depends(get_db)):
    ...
```

### 응답 형식
- 성공: Pydantic 모델 반환
- 에러: HTTPException 발생

## DB 가이드

SQLAlchemy를 사용합니다.

### 모델 정의
```python
from sqlalchemy import Column, Integer, String
from app.db.base import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
```

### 마이그레이션
```bash
alembic revision --autogenerate -m "description"
alembic upgrade head
```
```

### Flask (Python)

**감지 조건:**
- `pyproject.toml` 또는 `requirements.txt`에 `flask`

**추가 섹션:**

```markdown
## API 가이드

### 블루프린트 구조
```
app/
├── __init__.py       # create_app()
├── blueprints/
│   ├── auth.py
│   └── api.py
├── models/
└── services/
```

### 블루프린트 작성
```python
from flask import Blueprint, jsonify

bp = Blueprint('users', __name__, url_prefix='/users')

@bp.route('/<int:user_id>')
def get_user(user_id):
    ...
    return jsonify(user.to_dict())
```

## DB 가이드

Flask-SQLAlchemy를 사용합니다.

### 모델 정의
```python
from app import db

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True)
```

### 마이그레이션
```bash
flask db migrate -m "description"
flask db upgrade
```
```

### Express (Node.js)

**감지 조건:**
- `package.json`에 `express` 의존성

**추가 섹션:**

```markdown
## API 가이드

### 라우터 구조
```
src/
├── routes/
│   ├── index.ts
│   ├── users.ts
│   └── items.ts
├── controllers/
├── services/
├── models/
└── middleware/
```

### 라우터 작성
```typescript
import { Router } from 'express';
import { getUser, createUser } from '../controllers/users';

const router = Router();

router.get('/:id', getUser);
router.post('/', createUser);

export default router;
```

### 미들웨어 순서
1. cors
2. helmet
3. express.json()
4. 인증 미들웨어
5. 라우터
6. 에러 핸들러

## DB 가이드

{orm-library}를 사용합니다.

### 모델 예시 (Prisma)
```prisma
model User {
  id    Int     @id @default(autoincrement())
  email String  @unique
  name  String?
}
```

### 마이그레이션
```bash
npx prisma migrate dev --name description
npx prisma generate
```
```

### NestJS

**감지 조건:**
- `package.json`에 `@nestjs/core` 의존성

**추가 섹션:**

```markdown
## API 가이드

### 모듈 구조
```
src/
├── app.module.ts
└── modules/
    └── users/
        ├── users.module.ts
        ├── users.controller.ts
        ├── users.service.ts
        ├── dto/
        └── entities/
```

### 컨트롤러 작성
```typescript
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(+id);
  }
}
```

### DTO 정의
```typescript
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;
}
```

## DB 가이드

TypeORM을 사용합니다.

### 엔티티 정의
```typescript
@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;
}
```

### 마이그레이션
```bash
npm run migration:generate -- -n MigrationName
npm run migration:run
```
```

---

## 3. Fullstack 프레임워크

### Next.js

**감지 조건:**
- `package.json`에 `next` 의존성
- `next.config.js` 또는 `next.config.mjs` 존재

**추가 섹션:**

```markdown
## 라우팅

App Router를 사용합니다.

### 파일 기반 라우팅
```
app/
├── page.tsx              # /
├── layout.tsx            # 루트 레이아웃
├── loading.tsx           # 로딩 UI
├── error.tsx             # 에러 UI
├── users/
│   ├── page.tsx          # /users
│   └── [id]/
│       └── page.tsx      # /users/:id
└── api/
    └── users/
        └── route.ts      # API 라우트
```

### 페이지 타입
- Server Component (기본)
- Client Component (`'use client'`)

## 렌더링 전략

### 정적 생성 (SSG)
```typescript
// 빌드 타임에 생성
export const dynamic = 'force-static'
```

### 서버 사이드 렌더링 (SSR)
```typescript
// 요청마다 렌더링
export const dynamic = 'force-dynamic'
```

### 증분 정적 재생성 (ISR)
```typescript
export const revalidate = 60 // 60초마다 재검증
```

## API 라우트

```typescript
// app/api/users/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  const users = await getUsers()
  return NextResponse.json(users)
}

export async function POST(request: Request) {
  const body = await request.json()
  const user = await createUser(body)
  return NextResponse.json(user, { status: 201 })
}
```
```

### Nuxt

**감지 조건:**
- `package.json`에 `nuxt` 의존성
- `nuxt.config.ts` 존재

**추가 섹션:**

```markdown
## 라우팅

파일 기반 라우팅을 사용합니다.

### 디렉토리 구조
```
pages/
├── index.vue             # /
├── users/
│   ├── index.vue         # /users
│   └── [id].vue          # /users/:id
server/
├── api/
│   └── users/
│       ├── index.get.ts  # GET /api/users
│       └── index.post.ts # POST /api/users
```

### 레이아웃
```
layouts/
├── default.vue
└── dashboard.vue
```

## 렌더링 전략

### SSR (기본)
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  ssr: true
})
```

### SSG
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  ssr: true,
  nitro: {
    prerender: {
      routes: ['/']
    }
  }
})
```

### SPA
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  ssr: false
})
```

## Server API

```typescript
// server/api/users/index.get.ts
export default defineEventHandler(async (event) => {
  const users = await getUsers()
  return users
})

// server/api/users/index.post.ts
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const user = await createUser(body)
  return user
})
```
```

### Remix

**감지 조건:**
- `package.json`에 `@remix-run/react` 의존성

**추가 섹션:**

```markdown
## 라우팅

파일 기반 라우팅을 사용합니다.

### 라우트 구조
```
app/
├── root.tsx
└── routes/
    ├── _index.tsx        # /
    ├── users._index.tsx  # /users
    ├── users.$id.tsx     # /users/:id
    └── api.users.ts      # /api/users (resource route)
```

### 레이아웃 라우트
- `users.tsx` - `/users/*` 레이아웃
- `users._index.tsx` - `/users` 인덱스

## 데이터 로딩

### Loader (서버 데이터)
```typescript
export async function loader({ params }: LoaderFunctionArgs) {
  const user = await getUser(params.id)
  if (!user) throw new Response("Not Found", { status: 404 })
  return json({ user })
}
```

### Action (폼 제출)
```typescript
export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData()
  const user = await createUser(Object.fromEntries(formData))
  return redirect(`/users/${user.id}`)
}
```
```
