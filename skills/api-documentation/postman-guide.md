# Postman 문서화 가이드

API Request를 Postman Collection에 추가하는 상세 가이드입니다.

---

## 스크립트 위치

```bash
.claude/skills/api-documentation/scripts/postman/add.sh
```

## 기본 사용법

```bash
./scripts/postman/add.sh \
  --name "API 이름" \
  --method POST \
  --endpoint "/api/v1/..."
```

## 옵션 상세

| 옵션 | 필수 | 설명 |
|------|------|------|
| `--name` | O | Request 이름 |
| `--method` | O | HTTP 메서드 |
| `--endpoint` | O | API 경로 |
| `--body` | X | Request Body (JSON) |
| `--example` | X | Response Example (여러 개 가능) |

---

## Response Example 형식

```
"이름:상태코드:JSON응답"
```

예시:
- `"성공:201:{\"success\":true,\"data\":{...}}"`
- `"에러:400:{\"success\":false,\"error\":{...}}"`

---

## 사용 예시

### 기본 (Request만)

```bash
./scripts/postman/add.sh \
  --name "로그아웃 API" \
  --method POST \
  --endpoint "/api/v1/auth/logout"
```

### Request Body 포함

```bash
./scripts/postman/add.sh \
  --name "회원가입 API" \
  --method POST \
  --endpoint "/api/v1/auth/signup" \
  --body '{"email":"test@test.com","password":"password123","name":"테스트"}'
```

### Response Example 포함

```bash
./scripts/postman/add.sh \
  --name "회원가입 API" \
  --method POST \
  --endpoint "/api/v1/auth/signup" \
  --body '{"email":"test@test.com","password":"password123"}' \
  --example '성공:201:{"success":true,"data":{"id":"uuid"}}' \
  --example '에러 - 중복:409:{"success":false,"error":{"code":"USER_ALREADY_EXISTS","message":"이미 존재하는 이메일입니다."}}'
```

---

## 환경 설정

```bash
cd .claude/skills/api-documentation/scripts
cp env.sh.example env.sh
vi env.sh
```

```bash
# env.sh
export POSTMAN_API_KEY="PMAK-xxxxx"
export POSTMAN_COLLECTION_ID="collection-id"
```

## Postman API Key 발급

1. https://postman.co 로그인
2. Settings → API Keys → Generate API Key
3. Collection ID는 Collection URL에서 추출
