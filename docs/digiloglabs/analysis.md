# Paperclip 프로젝트 분석 (Digilog Labs)

> 분석 기준: 로컬 워크스페이스 `D:\workspace\ws_digiloglabs\paperclip`  
> 스냅샷 커밋: `b36dc532` (2026-05-18)  
> Fork: [digilog-labs/paperclip](https://github.com/digilog-labs/paperclip) ← upstream [paperclipai/paperclip](https://github.com/paperclipai/paperclip)

---

## 1. 한 줄 요약

**Paperclip**은 AI 에이전트로 구성된 “회사”를 운영하기 위한 **컨트롤 플레인(control plane)**이다.  
에이전트 실행 자체는 Claude Code·Codex·Cursor·OpenClaw 등 **외부 런타임(어댑터)**에 맡기고, Paperclip은 조직·업무·비용·승인·감사를 중앙에서 관리한다.

OpenClaw가 “직원”이라면, Paperclip은 “회사 OS”에 가깝다.

---

## 2. 제품 포지션

| 관점 | 내용 |
|------|------|
| **문제** | 일반 태스크 매니저는 “사람 팀” 전제. AI 에이전트 다수를 24/7 돌릴 때 조직·비용·거버넌스·맥락 유지가 부족 |
| **해결** | 회사(Company) 단위로 목표·조직도·이슈·하트비트·예산·승인을 한곳에서 통제 |
| **사용자** | 보드(인간 운영자) + 에이전트(API 키) |
| **라이선스** | MIT — fork·수정·배포 가능 ([LICENSE](../../LICENSE) 유지) |

### V1에서 확정된 제품 결정 (요약)

- **테넌시**: 단일 인스턴스, 데이터 모델은 멀티 컴퍼니
- **조직**: 단일 담당자 이슈, 원자적 checkout, 블로커·복구 이슈
- **통신**: 별도 채팅 없음 — 이슈·코멘트·문서 중심
- **예산**: 월(UTC) 단위, soft alert + hard limit 시 자동 pause
- **배포 모드**: `local_trusted`(기본) / `authenticated` (+ private/public 노출 정책)

상세 계약: `doc/SPEC-implementation.md`, `doc/PRODUCT.md`, `doc/GOAL.md`

---

## 3. 아키텍처 (2계층)

```
┌─────────────────────────────────────────────────────────┐
│  Control Plane (이 레포: server + ui + db + shared)      │
│  · Company / Agent / Issue / Goal / Approval / Cost      │
│  · Heartbeat 스케줄·상태·복구·워크스페이스 정책            │
└───────────────────────────┬─────────────────────────────┘
                            │ REST API / Webhook
                            ▼
┌─────────────────────────────────────────────────────────┐
│  Execution Layer (어댑터 + 플러그인)                     │
│  · claude-local, codex-local, cursor-local, gemini, grok  │
│  · openclaw-gateway, process/http, 외부 adapter plugin   │
└─────────────────────────────────────────────────────────┘
```

**핵심 원칙:** Paperclip은 에이전트 프로세스를 직접 “똑똑하게” 만들지 않는다. **호출·관찰·취소·비용·권한**을 통제한다.

---

## 4. 모노레포 구조

| 경로 | 역할 |
|------|------|
| `server/` | Express REST API, 오케스트레이션, 스케줄러(하트비트·예산·stuck run) |
| `ui/` | React + Vite 보드 UI (~70+ 페이지) |
| `packages/db/` | Drizzle 스키마·마이그레이션 (~79 schema 파일, ~86+ SQL migration) |
| `packages/shared/` | 공유 타입·상수·validator·API path |
| `packages/adapter-utils/` | 어댑터 공통 유틸 (stdout 파싱, workspace merge 등) |
| `packages/adapters/*/` | 내장 어댑터 10종 (claude, codex, cursor, gemini, grok, pi, opencode, acpx, openclaw, cursor-cloud) |
| `packages/plugins/*/` | 플러그인 SDK, llm-wiki, sandbox provider, 예제 플러그인 |
| `cli/` | `paperclipai` CLI (onboard, worktree, issue/agent API 클라이언트 등) |
| `doc/` | 제품·구현·DB·배포 모드 문서 (upstream 공유) |
| `docs/digiloglabs/` | **Digilog 전용** — fork 운영·분석 (`source_base.md`, 본 문서) |
| `tests/` | Vitest(기본), Playwright(e2e·release-smoke, opt-in) |

**패키지 매니저:** pnpm 9 workspace (`pnpm-workspace.yaml`)  
**런타임:** Node.js 20+

---

## 5. 핵심 도메인 모델

모든 비즈니스 엔티티는 **Company 스코프**다.

| 엔티티 | 역할 |
|--------|------|
| **Company** | 목표(MRR 등), 멤버십, 예산, 시크릿, 스킬 |
| **Agent** | org tree(`reports_to`), adapter type/config, API key |
| **Issue** | 단일 assignee, parent/sub-issue, blocker, checkout lock, 문서·첨부·work product |
| **Goal** | 회사·프로젝트 목표 계층 |
| **Heartbeat run** | 에이전트 1회 실행 단위, 이벤트·비용·watchdog |
| **Approval** | hire, CEO 전략 등 거버넌스 게이트 |
| **Routine** | 반복 스케줄 작업 (+ routine secrets) |
| **Cost / Budget** | 토큰·비용 이벤트, 월간 한도, hard-stop pause |
| **Plugin** | 외부 확장(어댑터·UI·sandbox·llm-wiki 등) |

**실행 제어 불변식** (운영 시 반드시 지켜짐):

- 이슈 `in_progress` 전환 시 **atomic checkout**
- **single-assignee** 모델
- 블로커·liveness·recovery 이슈로 “멈춤/루프” 처리 (`doc/execution-semantics.md`)
- 변경 작업은 **activity log**에 기록

---

## 6. 서버 API (표면)

`server/src/routes/` 기준 주요 REST 영역 (prefix `/api`):

| 라우트 그룹 | 기능 |
|-------------|------|
| `companies`, `agents`, `issues`, `goals`, `projects` | CRUD·트리·checkout |
| `approvals`, `activity`, `costs`, `dashboard` | 거버넌스·감사·비용 |
| `adapters`, `plugins` | 어댑터·플러그인 로드/설정 |
| `secrets`, `routines`, `environments` | 시크릿·루틴·실행 환경 |
| `execution-workspaces`, workspace runtime | worktree·프리뷰 서버·명령 실행 |
| `auth`, `access`, `invites` | 인증·멀티유저·초대 |
| `health`, `instance-settings` | 헬스·인스턴스 설정 |

**인증:**

- 보드: `local_trusted` 시 암묵적 full-control / `authenticated` 시 세션
- 에이전트: Bearer **agent API key** (회사 경계 엄격)

---

## 7. UI (보드)

React SPA. 주요 화면군:

- **운영**: Dashboard, Inbox( blocked 탭 등), Issues, Issue detail(채팅형 스레드)
- **조직**: Org chart, Agents, Approvals
- **설정**: Company settings, Secrets, Routines, Adapter manager, Plugin manager
- **인프라**: Instance settings, Workspaces, Costs
- **i18n**: 다국어 locale JSON (ko 포함, 2026-05 upstream 동기화분)

개발 시 API·UI 동일 오리진: `http://localhost:3100` (`pnpm dev`)

---

## 8. 어댑터·플러그인

### 내장 어댑터 (`packages/adapters/`)

| 어댑터 | 대상 런타임 |
|--------|-------------|
| `claude-local` | Claude Code (로컬 세션) |
| `codex-local` | OpenAI Codex CLI |
| `cursor-local` / `cursor-cloud` | Cursor |
| `gemini-local` | Gemini CLI |
| `grok-local` | Grok (비교적 신규) |
| `opencode-local`, `pi-local`, `acpx-local` | 기타 코딩 에이전트 |
| `openclaw-gateway` | OpenClaw 원격 게이트웨이 |

### 플러그인 (`packages/plugins/`)

- **plugin-sdk**: 플러그인 authoring 계약
- **plugin-llm-wiki**: 회사 지식 위키 플러그인
- **sandbox-providers**: Cloudflare, Daytona, E2B, exe-dev 등 격리 실행
- **외부 adapter plugin**: `~/.paperclip/adapter-plugins.json` 등으로 동적 로드 (코어 하드코딩 최소화 방향)

Digilog에서 Hermes 등 **커스텀 어댑터**를 쓸 경우: adapter plugin 경로로 core 수정 없이 붙이는 패턴이 upstream과도 맞다.

---

## 9. 데이터·로컬 개발

| 항목 | 기본값 |
|------|--------|
| DB | PostgreSQL; `DATABASE_URL` 미설정 시 **embedded Postgres** (`data/pglite` 또는 `~/.paperclip/instances/...`) |
| 파일 스토리지 | 로컬 디스크 또는 S3 호환 |
| 마이그레이션 | `pnpm db:generate` / `pnpm db:migrate` |
| 개발 기동 | `pnpm install` → `pnpm dev` |
| 검증 | `pnpm test` (Vitest), hand-off 시 `pnpm -r typecheck`, `pnpm build` |

CLI 하이라이트: `paperclipai onboard`, `worktree:make`, issue/agent 하위 명령, plugin install

---

## 10. 최근 upstream 동향 (fork 기준 시점)

`upstream/master` 대비 fork는 Digilog 문서 커밋 1개만 앞섬. upstream 최신(`242a2c2f` 부근)에 포함된 주요 영역:

- **Grok local adapter** 추가
- **Blocked inbox** UI·로직
- **Routine secrets**, execution workspace 개선
- **i18n** 다국어 UI 기반
- **Release** v2026.513.0 / v2026.517.0 태그·changelog

→ 제품은 “MVP 데모”를 넘어 **운영·복구·다언어·다어댑터**까지 확장된 단계.

---

## 11. Digilog Labs fork 관점

| 항목 | 상태 |
|------|------|
| **origin** | `digilog-labs/paperclip` — push·배포·CI 연결 대상 |
| **upstream** | `paperclipai/paperclip` — 주기적 merge |
| **Digilog 전용 문서** | `docs/digiloglabs/` (upstream PR과 분리 권장) |
| **커스터마이징 후보** | 어댑터 플러그인, 인스턴스/포트, QoL UI, 회사 템플릿, 배포 파이프라인 |

**추천 작업 순서 (아직 미구현):**

1. 로컬 `pnpm dev`로 인스턴스 1개 띄우고 Company·Agent 1팀 시나리오 검증  
2. 사용할 어댑터(예: cursor-local) + API key·시크릿 정책 확정  
3. Digilog 전용 변경은 `docs/digiloglabs/` + 플러그인/설정 파일로 경계 유지  
4. upstream 동기화 주기 정하기 (릴리스 태그·보안 advisory 우선)

운영 절차: [`source_base.md`](./source_base.md)

---

## 12. 리스크·주의점

| 리스크 | 설명 |
|--------|------|
| **Upstream 동기화 부담** | 활발한 monorepo — 대규모 merge 시 충돌 가능. `docs/digiloglabs/`만 분리해도 core 패치는 충돌 대상 |
| **복잡도** | 이슈·복구·워크스페이스·플러그인 교차 — 변경 시 `doc/execution-semantics.md`·테스트 확인 필요 |
| **Lockfile 정책** | PR에 `pnpm-lock.yaml` 커밋 금지 (CI가 master에서 재생성) — Digilog fork CI도 동일 정책 따를지 결정 필요 |
| **인증 모드** | `authenticated` + public exposure 시 보안 설정 필수 |

---

## 13. 참고 문서 (읽는 순서)

1. `doc/GOAL.md` — 비전  
2. `doc/PRODUCT.md` — 도메인 언어  
3. `doc/SPEC-implementation.md` — V1 구현 계약  
4. `doc/DEVELOPING.md` — 로컬 개발  
5. `doc/DATABASE.md` — 스키마  
6. `AGENTS.md` — 기여·검증·DB 변경 워크플로  
7. `docs/digiloglabs/source_base.md` — fork·remote 정책  

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-18 | 초안 — Digilog 워크스페이스 기준 프로젝트 분석 요약 |
