# Cloudtype 배포 (Digilog Labs)

## 지금 오류가 나는 이유

빌드 로그에 아래가 보이면 **Node.js 자동 빌드**를 쓰는 중입니다.

```text
-f /root/dockerfile.build-xxxxxxxx
#8 [build  4/10] COPY package.json yarn.lock* ...
#8 CACHED
```

이 방식은 `package.json` + lockfile만 COPY합니다. **`patches/`는 복사되지 않습니다.**

`#8 CACHED`가 있으면 **예전 커밋의 lockfile**(패치 경로 포함)이 그대로 쓰일 수 있어, GitHub `master`를 고쳐도 같은 `ENOENT`가 반복됩니다.

---

## 해결 (권장): Dockerfile 템플릿으로 전환

1. Cloudtype 서비스 → **설정** → 배포 방식이 **Node.js**가 아닌지 확인
2. 템플릿을 **Dockerfile**로 변경 (새 서비스를 만들어도 됨)
3. 저장소: `https://github.com/digilog-labs/paperclip` · 브랜치: **`master`**
4. Dockerfile 경로: **`Dockerfile.cloudtype`**
5. 포트: **3100**
6. **빌드 캐시 삭제** 후 재배포

저장소에 `.cloudtype/app.yaml`이 있어도, 대시보드에서 Node 템플릿을 쓰면 자동 `dockerfile.build-*`가 계속 생성됩니다. **반드시 Dockerfile 템플릿**을 선택하세요.

성공 시 로그에는 `Dockerfile.cloudtype` 또는 `COPY . .`가 보이고, `dockerfile.build-`는 **없어야** 합니다.

---

## 임시 우회 (Node 템플릿을 당장 못 바꿀 때)

빌드 설정 → **install** 명령 앞에 패치 파일을 받도록 한 줄 추가:

```bash
mkdir -p patches && curl -fsSL -o patches/embedded-postgres@18.1.0-beta.16.patch "https://raw.githubusercontent.com/digilog-labs/paperclip/master/patches/embedded-postgres@18.1.0-beta.16.patch" && pnpm i --frozen-lockfile
```

(이후 빌드 단계가 있으면 기존 Cloudtype 기본값에 맞게 이어 붙이세요.)

캐시 삭제 후 재배포. 근본 해결은 위 **Dockerfile.cloudtype** 전환입니다.

---

## `tsx` / preflight 빌드 오류

```text
Cannot find module '/app/cli/node_modules/tsx/dist/cli.mjs'
```

Node 자동 빌드가 **lockfile만으로 install → 전체 COPY → build** 순서라 workspace `node_modules`가 비어 있을 수 있습니다.

`master`의 `pnpm run build`는 `scripts/ci-build.mjs`가 이를 감지해 **재 install 후 `build:cloudtype`**(ui + plugin-sdk + server)만 실행합니다. 최신 `master`로 재배포하면 됩니다.

---

## 런타임 환경 변수

```env
DATABASE_URL=postgresql://...@...pooler.supabase.com:5432/postgres
BETTER_AUTH_SECRET=<랜덤 32자 이상>
PORT=3100
SERVE_UI=true
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=private
```

`DATABASE_URL` 등은 **런타임** env에만 넣으면 됩니다 (빌드 ARG 불필요).

## DB 마이그레이션

Supabase에 스키마가 없으면 로컬에서 한 번:

```powershell
# .env 로드 후
pnpm db:migrate
```

---

## 저장소 확인

| 항목 | 값 |
|------|-----|
| Fork | `digilog-labs/paperclip` |
| upstream (배포 X) | `paperclipai/paperclip` — 패치 lockfile 유지 |
| 패치 제거 커밋 | `c89f48c3` 이후 |

`master`의 `package.json`에 `patchedDependencies`가 **없어야** 정상입니다.
