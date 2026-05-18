# Paperclip 커스터마이징 가이드 (Digilog Labs)

Digilog Labs fork에서 **무엇을, 어디까지, 어떤 방식으로** 바꿀 수 있는지 정리한다.  
전제·동기화·라이선스는 [`source_base.md`](./source_base.md), 아키텍처 개요는 [`analysis.md`](./analysis.md)를 참고한다.

---

## 1. 원칙

| 원칙 | 설명 |
|------|------|
| **경계 분리** | Digilog 전용은 `docs/digiloglabs/`, 플러그인, 설정·env 위주. upstream과 충돌 적은 쪽을 우선 |
| **코어 최소 패치** | `server/`, `packages/db/schema` 대규모 수정은 upstream merge 비용이 큼 |
| **설정 우선** | CLI·Board·env·플러그인으로 되는 것은 코드 수정 없이 |
| **MIT 유지** | 루트 `LICENSE` 유지. 범용 개선은 upstream PR 검토 |
| **회사 스코프** | 런타임 데이터·정책은 Company 단위로 설계됨 (인스턴스 전역 설정과 구분) |

### upstream 동기화 난이도

| 등급 | 의미 | 예 |
|------|------|-----|
| **S** | 설정·데이터만, 코드 diff 거의 없음 | env, Supabase URL, 시크릿, 회사 import |
| **M** | 패키지 추가·UI·플러그인 | 외부 어댑터, llm-wiki, Board QoL |
| **H** | 코어 계약 변경 | 스키마, checkout, auth, execution-semantics |

---

## 2. 커스터마이징 분야 맵

```
┌─────────────────────────────────────────────────────────────┐
│  S — 설정·운영 (코드 없이 또는 env/CLI만)                      │
│  DB · 스토리지 · 시크릿 · 배포 모드 · 포트 · 인스턴스 설정        │
├─────────────────────────────────────────────────────────────┤
│  M — 확장 (플러그인·어댑터·회사 패키지·UI)                      │
│  에이전트 런타임 · 샌드박스 · 스킬 · i18n · 회사 템플릿           │
├─────────────────────────────────────────────────────────────┤
│  H — 코어 (fork 전용 브랜치·장기 유지보수 각오)                   │
│  DB 스키마 · API 권한 · 이슈/복구 시맨틱 · 어댑터 내장 등록       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 인프라·런타임 (S)

### 3.1 데이터베이스

| 항목 | 커스터마이징 | Digilog 현황 |
|------|----------------|--------------|
| **PostgreSQL 호스트** | `DATABASE_URL` (`.env` 또는 `~/.paperclip/.../.env`) | Supabase Session pooler **5432** 적용 완료 |
| **마이그레이션** | `pnpm db:migrate` (env 로드 필요) | 87 migration 적용 완료 |
| **풀러 분리** | `DATABASE_MIGRATION_URL`(direct 5432) + `DATABASE_URL`(6543) | 필요 시 추가 |
| **임베디드 PG** | `DATABASE_URL` 제거 시 `~/.paperclip/instances/default/db` | 사용 안 함 |
| **소스 배포(Cloudtype 등)** | fork에서 `pnpm.patchedDependencies`(embedded-postgres 패치) 제거 — lockfile만으로 `pnpm i` 가능 | Digilog 적용 |

- Paperclip 코어 테이블은 **`public` 스키마 고정**. 다른 앱과 DB 공유 시 테이블명 충돌 주의 (`agents`, `companies` 등).
- 스키마를 `paperclip` 등으로 분리하려면 **H급 fork 작업**.

참고: `doc/DATABASE.md`, `pnpm paperclipai configure --section database`

### 3.2 파일 스토리지 (첨부·이미지)

| 옵션 | 설정 |
|------|------|
| **local_disk** (기본) | `~/.paperclip/instances/default/data/storage` |
| **S3 호환** | `paperclipai configure --section storage` |

DB를 Supabase로 옮겨도 **파일은 자동으로 따라가지 않음**. 클라우드 배포 시 S3(R2, MinIO 등) 전환 검토.

### 3.3 시크릿

| 항목 | 설명 |
|------|------|
| **local_encrypted** (기본) | DB에 메타, `secrets/master.key`는 **로컬** — 백업 시 DB+키 둘 다 필요 |
| **aws_secrets_manager** | `doc/SECRETS-AWS-PROVIDER.md` |
| **회사/에이전트/루틴 바인딩** | Board → Secrets, routine `env` |
| **strict mode** | `PAPERCLIP_SECRETS_STRICT_MODE`, `configure --section secrets` |

에이전트 API 키·LLM 키·GitHub 토큰 등은 Board/CLI로 관리하는 편이 upstream과 맞음.

### 3.4 배포 모드·네트워크

| 항목 | 값·명령 |
|------|---------|
| **local_trusted** | 로컬 단일 운영자, 로그인 생략 (기본 개발) |
| **authenticated** | 로그인 필수 (`private` / `public`) |
| **bind** | `loopback`, `lan`, `tailnet`, `custom` — `pnpm dev --bind lan` 등 |
| **설정** | `pnpm paperclipai configure --section server`, `pnpm paperclipai onboard` |

인터넷 공개 시: `BETTER_AUTH_SECRET`, HTTPS, `doc/DEPLOYMENT-MODES.md` 준수.

### 3.5 환경 변수 (자주 쓰는 것)

| 변수 | 용도 |
|------|------|
| `DATABASE_URL` | Postgres (Supabase) |
| `DATABASE_MIGRATION_URL` | 마이그레이션 전용 연결 (선택) |
| `PORT` | API/UI 포트 (기본 3100) |
| `SERVE_UI` | UI 서빙 방식 |
| `PAPERCLIP_HOME` / `PAPERCLIP_INSTANCE_ID` | 인스턴스 루트 분리 |
| `PAPERCLIP_DEPLOYMENT_MODE` | `local_trusted` \| `authenticated` |
| `PAPERCLIP_PUBLIC_URL` | authenticated/public URL |
| `BETTER_AUTH_SECRET` | 인증 모드 시 필수 |

`.env`는 **git에 커밋하지 않음** (`.gitignore`).

---

## 4. 에이전트 실행·어댑터 (M — 권장 확장 경로)

에이전트 “누가 일하는가”는 **어댑터**로 결정한다. Digilog는 **외부 플러그인**을 우선한다.

### 4.1 내장 어댑터 (`packages/adapters/`)

| 어댑터 | 대상 | 커스터마이징 |
|--------|------|----------------|
| `claude-local` | Claude Code | adapter config, skills, workspace |
| `codex-local` | Codex CLI | company별 codex-home 시드 |
| `cursor-local` / `cursor-cloud` | Cursor | 로컬 vs 클라우드 |
| `gemini-local`, `grok-local` | Gemini, Grok | 모델·CLI 경로 |
| `opencode-local`, `pi-local`, `acpx-local` | 기타 CLI | |
| `openclaw-gateway` | OpenClaw | webhook/원격 |

내장 어댑터 **동작 변경**은 해당 패키지 수정 → **M~H**.

### 4.2 외부 어댑터 플러그인 (권장)

| 항목 | 설명 |
|------|------|
| **등록** | Board → Adapter manager, `~/.paperclip/adapter-plugins.json` |
| **npm / file:** | `@scope/package` 또는 로컬 경로 |
| **UI** | 패키지 `config-schema`, `ui-parser.js` — core `ui/`에 Hermes 등 하드코딩 불필요 |
| **스킬** | `.agents/skills/create-agent-adapter/SKILL.md` |

Hermes, Droid 등 **Digilog 전용 런타임**은 이 경로가 upstream 동기화와 가장 잘 맞음.

### 4.3 에이전트·회사 설정 (코드 없이)

| 영역 | 위치 |
|------|------|
| **조직도** | `reports_to`, 역할, capabilities |
| **adapter config** | SOUL/HEARTBEAT, CLAUDE.md 스타일 — 어댑터별 |
| **예산·하트비트** | Agent detail, Company settings |
| **스킬** | Company skills, agent skills |
| **실행 workspace** | Project policy, worktree, preview 서버 |

---

## 5. 플러그인 시스템 (M)

| 종류 | 경로·예 | 용도 |
|------|---------|------|
| **plugin-sdk** | `packages/plugins/sdk` | 플러그인 작성 계약 |
| **llm-wiki** | `plugin-llm-wiki` | 회사 지식 위키 |
| **sandbox** | Cloudflare, Daytona, E2B, exe-dev | 격리 실행 환경 |
| **예제** | `packages/plugins/examples/*` | 스캐폴드 참고 |
| **CLI** | `paperclipai plugin install <path>` | 로컬 개발 루프 |

플러그인 DB는 **전용 schema namespace** 가능 (코어 `public`과 분리).  
Digilog 전용 기능(연동, 대시보드, 사내 도구)은 **플러그인으로 추가**하는 것이 이상적.

---

## 6. UI·UX (M)

| 영역 | 경로 | 커스터마이징 예 |
|------|------|------------------|
| **페이지·라우트** | `ui/src/pages/`, `ui/src/lib/router.tsx` | Inbox, Dashboard, Issue detail |
| **컴포넌트** | `ui/src/components/` | blocked tab, run transcript, tool_group |
| **디자인** | `.claude/skills/design-guide/`, `/design-guide` | 토큰·패턴 |
| **i18n** | `ui/src/i18n/locales/*.json` | ko 기본·문구 조정 |
| **어댑터 UI** | `ui/src/adapters/*` | 내장 어댑터 폼 (외부는 ui-parser) |
| **Storybook** | `ui/storybook/` | 컴포넌트 단위 검증 |

QoL 패치(트랜스cript 접기, dashboard excerpt 등)는 **fork diff**로 관리하고 upstream PR 가능 여부를 따로 판단.

---

## 7. 서버·API·오케스트레이션 (M~H)

| 영역 | 경로 | 비고 |
|------|------|------|
| **REST 라우트** | `server/src/routes/` | company-scoped, activity log |
| **서비스** | `server/src/services/` | heartbeat, recovery, workspace-runtime |
| **스케줄러** | 서버 프로세스 내 | heartbeat, budget, stuck run |
| **실행 시맨틱** | `doc/execution-semantics.md` | checkout, blockers, recovery — **H** |
| **권한** | `server/src/routes/authz.ts` 등 | board vs agent API key |

비즈니스 규칙 변경(체크아웃, 복구, 예산 hard-stop)은 스펙·테스트와 함께 **H**.

---

## 8. 데이터 모델 (H)

| 작업 | 영향 |
|------|------|
| **스키마 추가/변경** | `packages/db/src/schema/` → `pnpm db:generate` → Supabase migrate |
| **공유 타입** | `packages/shared/` 동기화 필수 |
| **API·UI** | `server/`, `ui/` 계약 일치 |

Digilog 전용 컬럼·테이블이 필요하면:

1. fork에서 schema 추가  
2. 가능하면 **플러그인 namespace**로 대체 검토  
3. upstream merge 시 `packages/db` 충돌 계획

---

## 9. 회사·운영 데이터 (S~M)

코드 없이 Board/CLI/API로 채우는 영역.

| 영역 | 설명 |
|------|------|
| **Company import/export** | org·에이전트·이슈 템플릿 이전 |
| **Goals / Projects / Issues** | 목표 계층, 실행 workspace |
| **Routines** | 반복 작업, routine secrets |
| **Approvals** | hire, CEO 전략 등 |
| **Environments** | 실행 환경·리스 |
| **Costs / Budget** | 토큰 비용, 월간 한도 |

“우리 회사 운영 방식”은 **데이터·설정**으로 커스터마이징하는 것이 일반적.

---

## 10. CLI·개발 워크플로 (S~M)

| 항목 | 명령·용도 |
|------|-----------|
| **온보딩** | `paperclipai onboard` |
| **진단** | `paperclipai doctor` |
| **worktree** | `paperclipai worktree:make` — 격리 인스턴스·DB |
| **DB 백업** | `pnpm db:backup` |
| **빌드/테스트** | `pnpm dev`, `pnpm test`, `pnpm -r typecheck` |

Digilog 개발: `D:\workspace\ws_digiloglabs\paperclip`, fork `origin` push.

---

## 11. 배포·CI (S~M)

| 영역 | 커스터마이징 |
|------|----------------|
| **Docker** | `Dockerfile`, `doc/DOCKER.md` |
| **호스팅** | Fly, Railway, VPS + `authenticated/public` |
| **GitHub Actions** | fork `digilog-labs/paperclip` 워크플로 추가 |
| **환경 시크릿** | `DATABASE_URL`, `BETTER_AUTH_SECRET` 등 CI secret |

upstream lockfile 정책: PR에 `pnpm-lock.yaml` 커밋 금지 — fork CI 정책을 문서화할 것.

---

## 12. 문서·브랜딩 (S)

| 경로 | 용도 |
|------|------|
| `docs/digiloglabs/` | **Digilog 전용** (upstream PR 제외) |
| `doc/` | upstream 공유 — 동기화 시 주의 |
| `README` / UI branding | Instance settings, worktree favicon |

---

## 13. Digilog 권장 우선순위 (로드맵 초안)

| 순서 | 항목 | 등급 | 상태 |
|------|------|------|------|
| 1 | Supabase `DATABASE_URL` + migrate | S | ✅ 완료 |
| 2 | `pnpm dev` + Company·Agent 1팀 시나리오 | S | 진행 예정 |
| 3 | 사용 어댑터 확정 (cursor-local 등) + 시크릿 | S | |
| 4 | 외부 어댑터 플러그인 (Hermes 등) | M | |
| 5 | 스토리지 S3 (배포 시) | S | |
| 6 | `authenticated` + 배포 URL (공개 시) | S | |
| 7 | 회사 템플릿 / import 패키지 | M | |
| 8 | UI QoL (transcript, dashboard) | M | |
| 9 | 사내 플러그인 (llm-wiki, 연동) | M | |

---

## 14. 하지 않는 것이 나은 경우

| 시도 | 이유 |
|------|------|
| 다른 앱과 **같은 Supabase `public`** 공유 | 테이블명·마이그레이션 journal 충돌 |
| 코어 테이블 rename / 별도 스키마 (무계획) | 전 레이어 수정, upstream merge 거의 불가 |
| `LICENSE` 삭제·대체 | MIT 의무 위반 |
| upstream `doc/SPEC.md` 전면 교체 | fork 문서는 `docs/digiloglabs/`에 |

---

## 15. 관련 문서

| 문서 | 내용 |
|------|------|
| [`source_base.md`](./source_base.md) | fork·remote·동기화 |
| [`analysis.md`](./analysis.md) | 프로젝트 구조 분석 |
| `doc/DATABASE.md` | DB·Supabase·시크릿 |
| `doc/DEPLOYMENT-MODES.md` | 인증·bind |
| `doc/DEVELOPING.md` | 로컬 개발·worktree |
| `doc/execution-semantics.md` | 이슈·복구 규칙 |
| `AGENTS.md` | 기여·검증·DB 워크플로 |
| `.agents/skills/create-agent-adapter/` | 어댑터 패키지 작성 |

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-05-18 | 초안 — 커스터마이징 분야·등급·Digilog 우선순위 정리 |
