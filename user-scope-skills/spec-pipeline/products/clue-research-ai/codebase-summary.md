# clue-research-ai Codebase Summary

> 기획 관점에서 필요한 백엔드 코드베이스 요약. API 확장/신규 기능 기획 시 참조.

## 기술 스택

- **Framework**: FastAPI (Python 3.13)
- **DB**: PostgreSQL (asyncpg, SQLAlchemy 2.0, Alembic 마이그레이션)
- **AI/LLM**: Google Gemini (2.5 Flash/Pro/Lite) + LangGraph (상태머신 기반 대화)
- **인증**: JWT (clue-login 연동)
- **실시간**: SSE (Server-Sent Events) 스트리밍
- **DI**: dependency-injector

## DB 모델

### Research (연구 세션)
```
researches
├── id (PK, auto-increment)
├── code: "RA{ID}" (자동 생성, RA1, RA2...)
├── title (text)
├── chat_session_id (UUID) → LLM 대화 상태 연결
├── project_id (int, nullable) → NULL=개인공간, 값=프로젝트
├── created_by_id, updated_by_id → clue-login user
├── status: IN_PROGRESS | FAILED
└── created_at, updated_at, deleted_at (soft delete)
```

### ResearchDesign (연구설계 — AI 생성 결과)
```
research_designs
├── id (PK)
├── research_id (FK → Research, 1:1)
├── hypothesis (text)
├── research_objective (text)
├── study_type (text) — 연구 방법론
├── research_period, follow_up_period (text)
├── cohorts (JSONB) — [{inclusion: [...], exclusion: [...]}]
├── variables (JSONB) — [{name, definition, codes...}]
├── analysis_plan (text) — 통계 분석 계획
├── keywords (JSONB) — {general:[], diagnosis:[], surgery:[], medication:[], exam:[], ...}
└── timestamps
```

### ResearchDataValidation (데이터 검증 — CDW 코드 매핑)
```
research_data_validations
├── id (PK)
├── research_id (FK → Research, 1:1)
├── condition_codes (JSONB) — 진단 코드 (ICD-10, SNOMED-CT)
├── medication_codes (JSONB) — 약물 코드 (ATC, EDI, RxNorm)
├── exam_codes (JSONB) — 검사 코드 (LOINC)
├── procedure_codes (JSONB) — 수술/시술 코드 (ICD-9CM)
├── service_order_codes (JSONB) — 처방 코드
├── rehabilitation_codes (JSONB) — 재활 코드
├── nursing_note_template_codes (JSONB)
├── medical_note_template_codes (JSONB)
├── clinical_observation_item_codes (JSONB)
├── chief_complaint_codes (JSONB)
├── radio_therapy_codes (JSONB)
└── timestamps
각 코드 배열: [{name, codes:[], search:[], target}] (CodeGroupDict)
```

### ResearchFavorite (즐겨찾기)
```
research_favorites
├── id, research_id (FK), user_id
└── UNIQUE(research_id, user_id)
```

### 외부 읽기전용 테이블
- **UDM Meta 모델**: 도메인별 코드 카운트 (환자수/이벤트수)
  - ConditionCount, MedicationCount, ExamResultCount, ProcedureCount 등 11개
- **AboutData 모델**: 의학 코드 메타데이터 (코드명, 분류, 표준매핑)
  - 11개 도메인별 메타데이터 테이블

## API 엔드포인트

### 연구 관리 (/api/researches)
| Method | Path | 기능 |
|--------|------|------|
| GET | /api/researches | 목록 조회 (페이징, 정렬, 필터: all/starred/created_by_me) |
| POST | /api/researches | 연구 생성 (chat_session_id 자동 UUID) |
| GET | /api/researches/{id} | 단건 조회 |
| PATCH | /api/researches/{id} | 제목 수정 |
| DELETE | /api/researches/{id} | 소프트 삭제 |
| POST | /api/researches/{id}/duplicate | 복제 (단일 공간) |
| POST | /api/researches/{id}/duplicate/multi | 복제 (복수 공간) |

### 연구설계 (/api/researches/{id}/design)
| Method | Path | 기능 |
|--------|------|------|
| GET | .../{id}/design | 연구설계 조회 |
| PATCH | .../{id}/design | 부분 업데이트 (모든 필드) |

### AI 대화 (/api/chat)
| Method | Path | 기능 |
|--------|------|------|
| POST | /api/chat/sessions/{session_id} | SSE 스트리밍 대화 |
| GET | /api/chat/sessions/{session_id}/messages | 대화 이력 조회 |

**요청 body**: `{message: string, mode: "normal"|"apply"}`
- normal = 문답 (화면 영향 없음)
- apply = 화면 적용 (DB 업데이트)

**SSE 이벤트**: message_start → context_start → context (청크) → context_end → system (진행상태) → action (클라이언트 액션) → message_end

### 데이터 검증 (/api/researches/{id}/data-validation)
| Method | Path | 기능 |
|--------|------|------|
| GET | .../data-validation | 검증 데이터 전체 조회 |
| PATCH | .../data-validation | 코드 그룹 업데이트 |
| GET | .../code-metadata/conditions | 진단 코드 메타 (페이징, 검색) |
| GET | .../code-metadata/medications | 약물 코드 메타 |
| GET | .../code-metadata/exams | 검사 코드 메타 |
| GET | .../code-metadata/procedures | 수술/시술 코드 메타 |
| GET | .../code-metadata/{도메인} | + 6개 추가 도메인 (service-orders, rehabilitations, nursing/medical-note-templates, clinical-observation-items, chief-complaints, radio-therapies) |

**공통 쿼리 파라미터**: page, page_size(max=100), target, term, search_type(all/any), code_group_names

### 코호트 생성 (/api/researches/{id}/cohorts)
| Method | Path | 기능 |
|--------|------|------|
| POST | .../cohorts/generate | 외부 코호트 생성 API 호출 |

**요청**: `{cohort_index: int, cohort_name: string}`

### 즐겨찾기 (/api/researches/{id}/favorites)
| Method | Path | 기능 |
|--------|------|------|
| POST | .../favorites | 추가 (멱등) |
| DELETE | .../favorites | 제거 (멱등) |

## AI 워크플로우 (LangGraph)

### 그래프 노드 구조
```
사용자 메시지 입력
    ↓
[Router] research_intent_route — 의도 분류
    ├── 일반 질문 → general_inquiry_node → 답변
    ├── 정보 부족 → info_request_node → 추가 정보 요청
    └── 설계 작업 → design_info_check_route
                        ↓
                [Router] 정보 충분한가?
                    ├── 부족 → info_request_node
                    └── 충분 → design_work_node → AI 연구설계 생성
                                    ↓
                            keyword_extraction_node → 키워드 추출
                                    ↓
                            structure_node → DB 저장
                                    ↓
                            design_summary_node → 요약 생성

[화면적용 모드 시]
    update_db_route → update_info_check_route → update_db_validate_route
        → update_db_node → update_db_complete_node

[데이터 검증 관련]
    data_validation_search_node → data_validation_save_node → validation_complete_node

[코드 조회]
    code_extraction_node → code_search_response_node
```

### 프롬프트 관리
- DB 기반 프롬프트 버전 관리 (GraphNodePrompt + GraphNodePromptVersion)
- 노드별 active 프롬프트 1개, 핫스왑 가능 (코드 변경 없이)
- 서비스 초기화 시 1회 로드

### LLM 모델
- gemini-2.5-flash-lite (경량), gemini-2.5-flash (균형), gemini-2.5-pro (최고 성능)
- Temperature, max_tokens, top_p 설정 가능

## 인증 & 권한

| 레벨 | 동작 |
|------|------|
| CurrentUserId | JWT에서 user_id 추출, 없으면 401 |
| RequireAuth | 토큰 유효성만 검증 |
| AuthToken | 토큰 문자열 반환 (외부 API 전달용) |

### 접근 제어
- 사용자는 자기 연구(project_id=null) + 소속 프로젝트 연구만 조회 가능
- 수정/삭제: 본인 생성 연구만 (created_by_id 체크)
- 즐겨찾기: 사용자별 (user_id)
- 삭제: soft delete (deleted_at)

## 외부 연동

| 시스템 | 엔드포인트 | 용도 |
|--------|-----------|------|
| ClueAPI (gateway) | /api/v2/codes/list | 의학 코드 검색 (vocabulary별) |
| CohortGenerator (gateway) | /api/v2/cohort-generator/save | 코호트 생성 |
| UDM Meta DB | 읽기 전용 테이블 | 코드별 환자수/이벤트수 |
| clue-login | JWT 발급 | 사용자 인증 |

## 아키텍처 제약

- **전체 비동기**: 모든 Controller/Service/Repository가 async
- **PostgreSQL 3개 스키마**: clue_research_ai (메인), clue_research_ai_message (대화), clue_about_data_udm (메타)
- **LangGraph 체크포인트**: PostgreSQL에 대화 상태 영속화 → 대화 중단/재개 가능
- **상태 없음**: 글로벌 상태 없이 thread-safe (동시 다수 대화 지원)
- **코드 도메인**: 진단/약물/검사/수술 외에 7개 추가 도메인 (처방, 재활, 간호기록, 진료기록, 임상관찰, 주호소(chief_complaint), 방사선치료) = 총 11개 도메인
