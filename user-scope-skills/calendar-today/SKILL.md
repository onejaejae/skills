---
name: calendar-today
description: "Use when user asks about calendar, schedule, or agenda. Triggers: '오늘 일정', '이번 주 일정', '내일 뭐 있어', 'calendar', '캘린더', '일정 확인', '스케줄', 'what do I have today'."
---

# Calendar Today

Google Calendar 일정을 `gws` CLI로 조회하는 읽기 전용 스킬.

## 사전 조건
- `gws` CLI 설치 + `gws auth login -s calendar` 인증 완료

## 명령어

**항상 `--calendar 'enzo.cho@kakaohealthcare.com'`을 붙여서 본인 일정만 조회한다.**

| 요청 | 명령어 |
|---|---|
| 오늘 일정 | `gws calendar +agenda --today --calendar 'enzo.cho@kakaohealthcare.com'` |
| 내일 일정 | `gws calendar +agenda --tomorrow --calendar 'enzo.cho@kakaohealthcare.com'` |
| 이번 주 일정 | `gws calendar +agenda --week --calendar 'enzo.cho@kakaohealthcare.com'` |
| N일 후까지 | `gws calendar +agenda --days N --calendar 'enzo.cho@kakaohealthcare.com'` |

**반드시 `gws calendar +agenda`를 사용한다.** `gws calendar events list`나 직접 API 파라미터를 조합하지 않는다.

## 모호한 요청 처리

"캘린더", "스케줄" 등 모호한 요청은 질문하지 말고 **`--today`로 오늘 일정을 바로 조회**한다.

## 출력 규칙
- 시간순 정렬
- 제목, 시간, 장소(있으면)를 간결하게 보여준다
- 일정 없으면 "오늘은 일정이 없습니다" 명확히 응답
- 읽기 전용 — 일정을 생성/수정/삭제하지 않는다
