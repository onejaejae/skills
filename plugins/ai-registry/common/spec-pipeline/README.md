# Spec Pipeline Plugin

기획팀의 아이디어를 개발 Ready 기획서로 변환하는 3단계 파이프라인입니다.

## 파이프라인 흐름

```text
spec-interview → specs/{slug}-requirements.md
     ↓
spec-generator → specs/{slug}-spec.md
     ↓
spec-reviewer  → specs/{slug}-review.md (PASS/FAIL)
```

## 포함된 스킬 (4개)

| 스킬 | 역할 | 트리거 |
|------|------|--------|
| **spec-interview** | 비기술 언어로 역질문하여 요구사항 추출 | `기획 인터뷰`, `요구사항 정리` |
| **spec-generator** | 요구사항을 7개 섹션 기획서로 변환 | `기획서 생성`, `기획서 만들어줘` |
| **spec-reviewer** | 11개 체크리스트로 개발 Ready 검증 | `기획서 리뷰`, `개발 Ready 확인` |
| **spec-pipeline** | 3개 스킬을 순차 실행하는 오케스트레이터 | `기획 파이프라인`, `spec pipeline` |

## 주요 특징

- **비기술 언어 전용** — 기획팀이 직접 사용 가능, 기술 용어 사용 금지
- **[추정] 마킹 시스템** — AI가 채운 내용에 [추정] 마크, PM 확인 후 제거
- **미결 사항 전파** — interview → generator → reviewer로 미결 사항 추적
- **상태 전이 소유권** — interview가 발견, generator가 구조화, reviewer가 완전성 검증
- **PASS/FAIL 판정** — Critical 0개 = PASS (개발 Ready)

## 설치

```bash
/plugin install spec-pipeline@ai-registry
```

## 사용법

### 전체 파이프라인 실행
```bash
/spec-pipeline
```

### 특정 단계부터 시작
```bash
/spec-pipeline from:generator   # Stage 2부터
/spec-pipeline from:reviewer    # Stage 3부터
```

### 개별 스킬 실행
```bash
/spec-interview    # 요구사항 추출만
/spec-generator    # 기획서 생성만
/spec-reviewer     # 리뷰만
```

## 산출물

| 파일 | 설명 |
|------|------|
| `specs/{slug}-requirements.md` | 구조화된 요구사항 |
| `specs/{slug}-spec.md` | 7개 섹션 기획서 |
| `specs/{slug}-review.md` | PASS/FAIL 리뷰 결과 |

## 버전

- **1.0.0** — 초기 플러그인 릴리즈
