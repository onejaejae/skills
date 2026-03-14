# Agent Team Plugin

단독 에이전트, 서브에이전트, 에이전트 팀 중 최적의 접근법을 판단하고, 실행 가능한 프롬프트를 설계하는 플러그인.

## Features

- **Decision Tree**: 단독/서브에이전트/팀 중 최적 접근법 자동 판단
- **Autonomy Tier**: Prescribed(A) / Semi-autonomous(B) / Fully autonomous(C) 3단계
- **Topology Patterns**: Sequential Pipeline, Parallel Specialists, Generator+Critic, Map-Reduce, Competing Hypotheses
- **Copy-paste 실행 프롬프트**: 설계 결과를 바로 실행 가능한 프롬프트로 출력
- **Cost-aware**: 비용 비교를 통한 합리적 의사결정

## Skills

### agent-team

에이전트 팀 설계 및 실행 프롬프트 생성 스킬.

**트리거:**
- `agent team`, `team design`, `swarm`, `multi-agent`
- `팀 설계`, `에이전트 팀`, `팀 만들어`, `멀티 에이전트`
- `팀 구성`, `팀으로 작업`, `자율성`, `autonomy`

## Installation

```bash
claude plugins:install ai-registry/agent-team
```

## Usage

```bash
/agent-team 프론트엔드 리팩토링을 팀으로 진행하고 싶어
/agent-team 마이크로서비스 전환 작업 설계해줘
```
