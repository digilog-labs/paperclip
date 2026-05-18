# Cloudtype 배포 (Digilog Labs)

Paperclip은 **Next.js 앱이 아닙니다** (Vite UI + Express 서버). Cloudtype에서 **Next.js 템플릿을 쓰면 빌드가 실패**합니다.

## Next.js 오류 (`cp -rf ./.next/* /output`)

```text
RUN mkdir /output && cp -rf ./.next/* /output
exit code: 1
```

**원인:** 서비스가 **Next.js** 프리셋으로 잡혀 있음. 이 repo에는 `.next` 빌드 결과가 없습니다.

**해결:** Cloudtype 서비스 설정에서 템플릿을 **Dockerfile**로 바꿉니다 (Next.js / Node 자동 감지 X).

| 설정 | 값 |
|------|-----|
| 템플릿 | **Dockerfile** |
| Dockerfile 경로 | `Dockerfile.cloudtype` |
| 브랜치 | `master` |
| 포트 | `3100` |

성공 로그: `Dockerfile.cloudtype`, `pnpm run build:cloudtype` — **`.next` / `dockerfile.build-` 없음**.

설정 변경이 안 먹으면 서비스를 삭제하고 위 값으로 **새로 생성**하는 편이 빠릅니다.

### 대시보드에서 바꾸는 방법 (요약)

1. [Cloudtype](https://cloudtype.io) → 해당 **서비스** 클릭  
2. **설정** (또는 톱니/빌드 설정)  
3. **앱 종류 / 템플릿 / 프레임워크**가 `Next.js`이면 → **`Dockerfile`** 로 변경  
4. **Dockerfile 경로**: `Dockerfile.cloudtype` (기본값 `Dockerfile`만 두지 말 것)  
5. **루트 디렉토리**: 비움 또는 `/` (서브디렉터리 `ui` 등 X)  
6. **브랜치**: `master`  
7. 저장 후 **캐시 없이** 재배포  

**여전히** 로그에 `cp ./.next/*` 가 보이면 Next 템플릿이 그대로인 것입니다. 코드 push만으로는 이 단계가 사라지지 않습니다.

배포는 **Cloudtype 대시보드** Git 연동 + `master` 브랜치 기준으로 진행합니다.

---

## Node 템플릿 — 패치 ENOENT (다시 나올 때)

```text
ENOENT ... patches/embedded-postgres@18.1.0-beta.16.patch
```

`master`(`d838fa43`+)에는 패치가 **없습니다**. 아래 중 하나를 하세요.

1. **브랜치 `master`** 인지 확인 (다시 `main` 등으로 바뀌지 않았는지)
2. **빌드 캐시 삭제** 후 재배포 (템플릿을 Next↔Node로 바꾸면 캐시가 꼬이기 쉬움)
3. Node **설치(install) 명령**을 Cloudtype 빌드 설정에 넣기 (기본 `pnpm i` 대체):

```bash
mkdir -p patches && curl -fsSL -o patches/embedded-postgres@18.1.0-beta.16.patch "https://raw.githubusercontent.com/digilog-labs/paperclip/master/patches/embedded-postgres@18.1.0-beta.16.patch"; NODE_ENV=development pnpm install --frozen-lockfile
```

4. 근본 해결: **Dockerfile** 템플릿 + `Dockerfile.cloudtype`

---

## Node 자동 빌드 (`dockerfile.build-*`)

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

### `JSX.IntrinsicElements` / `implicitly has an 'any' type` (InstanceSettings.tsx)

빌드 단계에서 `NODE_ENV=production`이면 `pnpm install`이 **devDependencies**(`@types/react` 등)를 설치하지 않아 UI `tsc -b`가 실패합니다.

- 빌드 시 `NODE_ENV`를 production으로 두지 않거나, 최신 `master`의 `ci-build.mjs` / `Dockerfile.cloudtype` 사용 (install 시 `NODE_ENV=development`).

---

## `Missing script: "start"`

Node 템플릿 기본 시작 명령은 `npm start` 입니다. `master`에는 루트 `start` 스크립트가 있습니다 (프로덕션 서버 실행).

Cloudtype **시작(start)** 명령을 비우면 `npm start` 를 쓰고, 직접 지정하려면:

```bash
npm start
```

또는:

```bash
node server/dist/index.js
```

(`tsx`는 devDependency라 프로덕션 이미지에 없음 — 컴파일된 `dist`만 실행)

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
