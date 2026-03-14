# skill-creator

효과적인 스킬 생성을 위한 가이드 스킬

## 설치

```bash
/plugin install skill-creator@ai-registry
```

## 사용법

### 트리거

스킬을 새로 만들거나 기존 스킬을 업데이트하고 싶을 때 자동 실행

### 스킬 생성 프로세스

1. **Step 1**: 스킬 이해 (구체적 예시 수집)
2. **Step 2**: 재사용 리소스 계획 (scripts, references, assets)
3. **Step 3**: 스킬 초기화 (`init_skill.py`)
4. **Step 4**: 스킬 편집 (SKILL.md 작성)
5. **Step 5**: 스킬 패키징 (`package_skill.py`)
6. **Step 6**: 실사용 기반 반복 개선

### 제공 스크립트

```bash
# 스킬 초기화
scripts/init_skill.py <skill-name> --path <output-directory>

# 스킬 패키징
scripts/package_skill.py <path/to/skill-folder>

# 빠른 검증
scripts/quick_validate.py <path/to/skill-folder>
```

### 스킬 구조

```
skill-name/
├── SKILL.md          # 필수 (frontmatter + body)
├── scripts/          # 실행 스크립트
├── references/       # 참조 문서
└── assets/           # 출력에 사용될 파일
```

## 버전

- Current: 1.0.0
- [CHANGELOG](./CHANGELOG.md)
