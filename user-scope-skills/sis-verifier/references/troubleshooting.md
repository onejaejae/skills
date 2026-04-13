# sis-verifier troubleshooting

알려진 실패 패턴과 해결법. **재발견 방지**가 목적.

## 1. iframe target을 못 찾음

**증상**: `cdp_helper.py find` 가 `{"found": false}` 반환.

**원인 + 해결**:
1. SiS 앱이 아직 로드 중 → 추가 5~10초 대기 후 재시도
2. URL substring이 다름 → `SIS_IFRAME_HINT` 환경변수로 변경
   - 기본: `awsapnortheast` (서울 region)
   - 다른 region: `awsuseast`, `awseuwest`, `awsapsoutheast` 등
   - 가장 안전: `snowflake.app` 부분 매칭
3. chromux daemon이 죽음 → `chromux ps`, `chromux launch default`
4. 페이지가 다른 탭에 있음 → `chromux open <session> <url>` 다시 호출

## 2. 클릭이 dispatch는 OK인데 UI 변화 없음

**증상**: `cdp_helper.py click x y` 가 OK 반환하지만 "Running..." 안 뜸.

**원인 + 해결**:
1. **부모 page WS에 dispatch함** (가장 흔함)
   - 잘못: `Page.find` 결과의 main page WS에 click
   - 올바름: iframe target의 WS에 click — `cdp_helper.py`는 자동으로 iframe target 사용
2. **좌표 빗나감**
   - `cdp_helper.py buttons` 또는 `cdp_helper.py query "<selector>"` 로 정확한 cx/cy 측정
   - 추정 좌표는 ±50px 빗나갈 수 있음
3. **버튼이 disabled 상태**
   - `cdp_helper.py query "button:not([disabled])"` 로 활성 버튼 확인
4. **iframe-local 좌표가 아닌 viewport 좌표 전달**
   - iframe target에 attach하면 좌표는 iframe own viewport (0,0부터)
   - 부모 viewport 좌표 (예: 750, 492)는 사용 금지

## 3. 스크롤이 안 먹힘

**증상**: `cdp_helper.py scroll 800` 결과 `error: container not found` 또는 scrollTop이 0 그대로.

**원인 + 해결**:
1. Streamlit 버전에 따라 scroll 컨테이너 selector가 다를 수 있음
   - 일반: `section.main`
   - 신규: `[data-testid="stMain"]`
   - 폴백: `cdp_helper.py scroll 800 "[data-testid='stMain']"`
2. iframe 자체가 overflow:hidden → 내부에 별도 scrollable이 있음
   - 직접 찾기: `cdp_helper.py query "[style*='overflow']"` 또는 inspect

## 4. websocket-client 설치 안 됨

**증상**: `ImportError: No module named 'websocket'`

**원인 + 해결**:
1. system Python (/usr/bin/python3) 의 pip은 `--break-system-packages` 옵션 없음
2. 해결: `pip3 install --user websocket-client`
3. 그래도 안 되면: venv 만들어서 사용. 단 helper 스크립트는 system python을 호출하므로 venv 사용 시 shebang 변경 필요

## 5. 페이지 타이틀이 "Snowflake" 으로 고정

**증상**: chromux snapshot의 첫 줄이 항상 "Snowflake"이고 앱 타이틀 안 보임

**원인 + 해결**:
- 정상. SiS의 outer page는 Snowflake 콘솔, 앱 타이틀은 iframe 안에 있음
- iframe target에서 `document.title` 가져와야 앱 타이틀 확인 가능
- `cdp_helper.py query "h1, [data-testid='stHeader']"` 로 상단 타이틀 확인

## 6. AI/Forecast 호출이 5분 이상 걸림

**증상**: "Running..." 이 5분+ 표시되고 결과 안 옴

**원인 + 해결**:
1. Cortex LLM 호출 큐 대기 → 정상 (1~3분 가능). 5분 넘으면 비정상
2. Forecast 모델이 캐시 안 됨 → 첫 호출 60초+
3. Snowflake warehouse가 suspended → 자동 resume 시간 (10~30초)
4. 비정상이면: 사용자 보고. cdp_helper로는 Snowflake 백엔드 상태 확인 불가

## 7. cliclick / AppleScript 사용 시도 (금지)

**증상**: 좌표 클릭하려고 cliclick 또는 osascript 시도

**원인 + 해결**:
- AppleScript는 macOS Accessibility 권한 필요 (일반적으로 거부됨)
- cliclick은 OS 좌표 사용 → Chrome window 위치 계산 + DPR 보정 필요 → 복잡하고 깨지기 쉬움
- **CDP가 더 깔끔**. 절대 cliclick/AppleScript로 우회하지 말 것

## 8. screenshot은 OK인데 시각 확인이 어려움

**증상**: 스크린샷에 너무 많은 콘텐츠가 들어가서 특정 영역만 보고 싶음

**해결**:
- chromux screenshot 후 전체 PNG를 Read
- 또는 scroll로 특정 영역으로 이동 후 다시 스크린샷
- viewport 단위로 한 번에 한 화면씩 확인하는 게 효율적

## 9. iframe target이 여러 개 (Stripe/광고 등)

**증상**: `find` 결과가 SiS 아닌 다른 iframe (Stripe 등)을 반환

**원인 + 해결**:
- 페이지에 Stripe.js, GA 등 third-party iframe 다수 존재
- `cdp_helper.py find` 는 `awsapnortheast` substring으로 필터 → SiS만 매칭
- substring이 부정확하면 환경변수로 좁히기

## 10. chromux + multi-tab

**증상**: 같은 SiS 앱이 여러 탭에 열려서 어느 게 verify 대상인지 모호

**해결**:
- 같은 session 이름 재사용 (`chromux open verify <url>`) → idempotent하게 같은 탭 재사용
- 그래도 의심스러우면 `chromux close <session>` 후 다시 open
