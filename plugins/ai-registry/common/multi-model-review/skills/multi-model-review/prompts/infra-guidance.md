## Infra/DevOps 특화 리뷰 관점

이 PR은 **인프라/DevOps 코드** (Terraform, Docker, CI/CD, 배포 스크립트 등)를 포함합니다. 아래 6개 카테고리를 추가로 점검하세요.
발견된 이슈는 기존 카테고리(security, performance, quality, testing)로 분류하세요.

---

### 1. CLI/도구 동작 정확성 → category: `quality`

| 체크포인트 | 설명 |
|-----------|------|
| CLI 명령어 실제 동작 확인 | `gcloud compute scp --recurse dir/`는 dir 자체가 아닌 dir **내용**을 복사함. `docker compose up`은 현재 디렉터리의 `docker-compose.yml`을 찾음. CLI 도구의 실제 동작을 추측하지 말고 정확히 알고 있는 경우에만 이슈 제기 |
| 경로/디렉터리 가정 | 원격 명령 실행 시 작업 디렉터리, 파일 복사 대상 경로, 마운트 경로가 실제로 일치하는지 확인 |
| 환경변수 전달 | 시크릿/환경변수가 올바른 방식으로 전달되는지 (파이프, stdin, 파일, 환경변수) — 특히 CI/CD에서 secrets 접근 방식 |
| 명령어 체이닝 | `;`(항상 실행) vs `&&`(이전 성공 시만) vs `\|\|`(이전 실패 시만) — 원격 실행 시 특히 중요 |

> **중요**: CLI 도구의 동작이 확실하지 않으면 P1/P2로 올리지 마세요. 확실한 경우만 높은 우선순위로 보고하고, 불확실하면 P3 이하로 분류하거나 생략하세요.

---

### 2. 컨테이너/Docker → category: `security`

| 체크포인트 | 설명 |
|-----------|------|
| 루트 실행 | 컨테이너가 root로 실행되는지 — 비root 사용자 권장 (`USER` 지시자) |
| Docker 그룹 권한 | 호스트에서 docker를 실행하려면 사용자가 docker 그룹에 속해야 함. `usermod -aG docker` 또는 `sudo` 필요 여부 확인 |
| 이미지 태그 | `latest` 태그 사용은 재현성 저하 — 구체적 버전 태그 또는 digest 사용 권장 |
| 볼륨 마운트 | 호스트의 민감 경로(`/`, `/etc`, `/var/run/docker.sock`) 마운트 시 보안 위험 |
| 리소스 제한 | `mem_limit`, `cpus` 등 리소스 제한 없으면 단일 컨테이너가 호스트 자원 독점 가능 |
| 로그 관리 | `logging.driver`와 `max-size`/`max-file` 미설정 시 로그가 디스크를 가득 채울 수 있음 |

---

### 3. Terraform/IaC → category: `quality`

| 체크포인트 | 설명 |
|-----------|------|
| validate/plan 생략 | `terraform apply` 전에 `terraform validate`와 `terraform plan` 단계 필수 — 예측 불가능한 변경 방지 |
| Lock 파일 관리 | `.terraform.lock.hcl`은 프로바이더 버전을 고정하는 파일 — git에 커밋해야 환경 간 일관성 보장 |
| 변수 설명 | `variable` 블록에 `description` 필드 누락 시 사용 목적 파악 어려움 |
| 하드코딩 값 | 환경별로 달라야 하는 값(project_id, region 등)이 리터럴로 하드코딩 — 변수화 필요 |
| State 관리 | 원격 backend(GCS, S3) 미설정 시 로컬 state 파일 유실 위험. state locking 미사용 시 동시 적용 충돌 |
| 리소스 명명 | 리소스 이름에 환경 구분자 없으면 멀티 환경에서 충돌 가능 |

---

### 4. CI/CD 파이프라인 → category: `quality`

| 체크포인트 | 설명 |
|-----------|------|
| Race condition | VM/컨테이너 시작과 배포 명령 실행 사이의 타이밍 — startup script 완료 전에 배포가 시작될 수 있음 |
| 시크릿 노출 | 로그에 시크릿이 출력되는지, `--quiet` 없이 민감 명령 실행되는지 확인 |
| 재현성 | 워크플로우 재실행 시 동일한 결과를 보장하는지 — 멱등성(idempotency) 확인 |
| 권한 범위 | Service account, IAM role의 권한이 최소 권한 원칙을 따르는지 |
| 실패 복구 | 배포 중간 실패 시 롤백 전략이 있는지, 부분 적용 상태가 남지 않는지 |
| 환경 분리 | dev/stg/prod 워크플로우가 적절히 분리되어 있는지, 실수로 프로덕션에 배포되지 않는지 |

---

### 5. 네트워크/보안 → category: `security`

| 체크포인트 | 설명 |
|-----------|------|
| TLS/HTTPS | 웹 서비스가 HTTP로만 접근 가능하면 인증정보가 평문 전송 — TLS 종료 레이어(reverse proxy, LB) 또는 자체 TLS 설정 필요 |
| 방화벽 규칙 | 0.0.0.0/0 허용, 불필요한 포트 개방, IP 화이트리스트 미적용 |
| SSH 접근 | 패스워드 인증 허용, root SSH 접근 허용, SSH 키 관리 미흡 |
| 시크릿 관리 | 하드코딩된 비밀번호/API 키, 환경변수로 시크릿 전달 시 프로세스 목록에 노출 가능성 |
| DNS/인증서 | 도메인 없이 IP 직접 접근, 인증서 자동 갱신 미설정 |

---

### 6. 운영 안정성 → category: `performance`

| 체크포인트 | 설명 |
|-----------|------|
| 로그 로테이션 | 컨테이너/서비스 로그의 크기 제한과 로테이션 설정 여부 — 미설정 시 디스크 풀 위험 |
| 모니터링 | 서비스 헬스체크, 알림 설정, 대시보드 프로비저닝이 배포와 함께 구성되는지 |
| 백업 | 데이터 볼륨/DB의 백업 전략 존재 여부 |
| 자동 복구 | 컨테이너 `restart: unless-stopped` 또는 `always`, systemd 서비스의 `Restart=on-failure` 설정 |
| 디스크 관리 | Docker image/volume pruning 전략, 임시 파일 정리 크론잡 등 |

---

> **주의**: 위 체크포인트는 추가 관점입니다. 기본 리뷰 관점(보안, 성능, 품질, 테스트)도 반드시 함께 수행하세요.
> 발견된 이슈의 `category`는 반드시 기존 4개(security, performance, quality, testing) 중 하나로 분류하세요.
> **CLI 도구의 동작을 추측하지 마세요.** 정확히 알고 있는 동작만 근거로 이슈를 제기하세요.
