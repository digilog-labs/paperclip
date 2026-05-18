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
| 빌드 | `pnpm install --frozen-lockfile` (**pnpm** — `npm install` X) |
| 시작 | `npm start` (`cloudtype-start`가 deps 없으면 `pnpm install` 후 기동) |
| 포트 | **3100** |

런타임 env:

```env
DATABASE_URL=postgresql://...@...pooler.supabase.com:5432/postgres
BETTER_AUTH_SECRET=<랜덤 32자 이상>
PORT=3100
SERVE_UI=true
```

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

Supabase에 스키마가 없으면 로컬에서 한 번:

```powershell
pnpm db:migrate
```

---

## 저장소

- Fork: `digilog-labs/paperclip`
- upstream `paperclipai/paperclip` 은 패치 lockfile 유지 — 배포 브랜치는 fork `master` 만 사용
