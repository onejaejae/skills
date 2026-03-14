---
name: api-documentation
description: >
  API 문서화 스킬. Notion과 Postman에 API 명세를 추가합니다.
  Use when documenting APIs, updating Notion database, or adding Postman requests.
---

# API Documentation

API 문서화 스킬입니다. Notion과 Postman에 API 명세를 추가합니다.

---

## 모드

| 모드 | 호출 시점 | 역할 |
|-----|----------|-----|
| `draft` | Phase 2 (Docs 생성 및 브랜치 준비) | Task Definition 기반 docs 페이지 초안 생성 |
| `finalize` | Phase 6 (문서화) | 실제 구현 기반으로 API Spec 업데이트 |

### Draft 모드 (Phase 2)

Task 분석 완료 후 docs 페이지 초안 생성:
- 배경, 주요 요구사항, Notes
- 예상 API Spec (placeholder)

```bash
./scripts/notion/add.sh --mode draft \
  --name "API명" --method POST --endpoint "/api/v1/..." --tag Tag \
  --create-docs \
  --background "배경 설명" \
  --requirements "기능 요구사항"
```

### Finalize 모드 (Phase 6)

구현 완료 후 **기존 docs 페이지를 업데이트**하고 **API row 상태를 변경**합니다:
- 실제 Request Body (DTO 기반)
- 실제 Response Schema (Service 기반)
- API row 상태: "구현예정" -> "구현완료"

**주의:** Finalize 모드는 새 API row를 생성하지 않습니다.

```bash
./scripts/notion/add.sh --mode finalize \
  --docs-id "기존-docs-page-id" \
  --api-row-id "기존-api-row-id" \
  --request-body '{"title":"string","content":"string"}' \
  --response '201:{"success":true,"data":{...}}' \
  --response '400:{"success":false,"error":{...}}'
```

---

## 상세 가이드

- Notion 옵션 및 시나리오: [notion-guide.md](notion-guide.md)
- Postman 옵션 및 예시: [postman-guide.md](postman-guide.md)

---

## 환경 설정

```bash
cd .claude/skills/api-documentation/scripts
cp env.sh.example env.sh
vi env.sh  # API 키 입력
```

---

## 완료 조건

Phase 6 완료 기준:
- [ ] Notion 스크립트 실행 성공
- [ ] Postman 스크립트 실행 성공
- [ ] docs 페이지 연결 확인
