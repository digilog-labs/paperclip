# Cloudtype 배포 (Digilog Labs)

## 권장: 로컬 빌드 → Git에 산출물 커밋

Cloudtype 소형 인스턴스(~1GB)에서는 UI Vite 빌드가 **OOM** 납니다.  
**로컬(또는 CI)에서 빌드한 뒤 결과물만 push** 하는 방식을 씁니다.

### 1. 로컬에서 빌드

```powershell
cd D:\workspace\ws_digiloglabs\paperclip
pnpm install
pnpm run build:deploy:git
```

생성·커밋 대상:

| 경로 | 내용 |
|------|------|
| `server/dist/` | API 서버 (tsc) |
| `server/ui-dist/` | Board UI 정적 파일 |
| `packages/plugins/sdk/dist/` | 플러그인 SDK (런타임 bin) |

### 2. Git 커밋 & push

```powershell
git add server/dist server/ui-dist packages/plugins/sdk/dist package.json pnpm-lock.yaml
git commit -m "chore(deploy): refresh Cloudtype build artifacts"
git push origin master
```

### 3. Cloudtype 설정

| 항목 | 값 |
|------|-----|
| 템플릿 | **Node.js** (또는 Dockerfile) |
| 브랜치 | **`master`** |
| **빌드 (install)** | `pnpm install --frozen-lockfile` (**필수**, pnpm만) |
| 시작 | `npm start` |

빌드 단계에서 `pnpm install`을 하면 **시작이 수 초**면 됩니다.  
시작 시 install만 하면 **첫 기동 1~2분** 걸릴 수 있습니다 (정상).

`Proceed? (Y/n)` 로그가 보이면 install이 **실패**한 것입니다 — `.npmrc`의 `confirm-modules-purge=false` 와 최신 `cloudtype-start.mjs` 필요.
| 포트 | **3100** |

### Cloudtype 포트

서비스 **포트 3100** (외부 HTTPS → 컨테이너 3100). Cloudtype 대시보드 포트와 `PORT` env가 같아야 합니다.

### 런타임 env (필수)

로그에 `Bind loopback (127.0.0.1)` 이면 **외부에서 접속 불가**입니다. 반드시:

```env
HOST=0.0.0.0
PORT=3100
SERVE_UI=true
DATABASE_URL=postgresql://...@...pooler.supabase.com:5432/postgres
BETTER_AUTH_SECRET=<랜덤 32자 이상 32자>
```

성공 시 기동 배너:

```text
Bind             all interfaces (0.0.0.0)
Server           3100
UI               http://0.0.0.0:3100/   (또는 static 경로)
```

`UI disabled` → Cloudtype에 **`SERVE_UI=true`** 가 없음 (로컬 `.env`의 `false`를 그대로 쓰지 말 것).

### 공개 URL + 로그인 (권장)

Cloudtype URL이 `https://xxxx.cloudtype.app` 이면:

```env
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=private
PAPERCLIP_PUBLIC_URL=https://xxxx.cloudtype.app
```

첫 접속 후 `pnpm paperclipai onboard` 로 보드 사용자/초대 설정 (로컬에서 같은 DB를 쓰는 경우).

`npm start` → `cloudtype-start.mjs` → `server/dist` + `server/ui-dist` 확인 후 서버 기동 (서버에서 **빌드 안 함**).

코드/UI 변경 후 배포할 때마다 **1~2단계 반복**합니다.

---

## Next.js 템플릿 사용 금지

Paperclip은 Next.js가 아닙니다. 로그에 `cp ./.next/*` 가 보이면 템플릿을 **Node** 또는 **Dockerfile** 로 바꾸세요.

---

## Dockerfile (대안)

| 설정 | 값 |
|------|-----|
| 템플릿 | Dockerfile |
| 경로 | `Dockerfile.cloudtype` |

이미지 안에서 빌드하므로 RAM이 더 필요할 수 있습니다. 소형 플랜은 **커밋 방식**이 낫습니다.

---

## DB 마이그레이션

### `agent_runtime_state already exists` / Cloudtype만 81 pending

**증상:** 로컬 `pnpm db:migrate` → `No pending migrations` 인데, Cloudtype 로그는 `Applying 81 pending migration(s)...` 후 실패.

**원인:** Supabase **스키마(테이블)와 migration 저널(`__drizzle_migrations`)이 어긋난 상태**입니다. Cloudtype 기동 시 `db:migrate`로 CREATE를 다시 실행하면 충돌합니다. (`cloudtype-start`는 더 이상 migrate 하지 않음)

**한 번만 정리 (데이터 삭제 OK):**

**1) Supabase 대시보드 → SQL Editor** 에서 실행:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
DROP SCHEMA IF EXISTS drizzle CASCADE;
```

**2) 로컬** (`.env`의 `DATABASE_URL` = Cloudtype과 **완전 동일** 문자열):

```powershell
cd D:\workspace\ws_digiloglabs\paperclip
pnpm db:migrate
# 반드시: No pending migrations
```

**3) Cloudtype env** — `DATABASE_URL` 붙여넣기 후 **재배포**

**4) 로그 확인**

- `[cloudtype-start] DATABASE_URL host=aws-1-ap-northeast-2.pooler.supabase.com db=postgres` (호스트가 로컬과 같아야 함)
- 서버 기동 시 `Applying 81 pending` **없어야** 정상 (비대화형이면 pending 있을 때 자동 적용 시도 → 같은 오류)

로컬과 Cloudtype **호스트/DB 이름**이 다르면 다른 DB를 보는 것입니다.

### 빈 DB

```powershell
pnpm db:migrate
```

---

## 저장소

- Fork: `digilog-labs/paperclip`
- upstream `paperclipai/paperclip` 은 패치 lockfile 유지 — 배포 브랜치는 fork `master` 만 사용
