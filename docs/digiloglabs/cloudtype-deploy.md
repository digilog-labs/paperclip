# Cloudtype 배포 (Digilog Labs)

## 패치 오류 (`patches/embedded-postgres... ENOENT`)

### 원인

자동 생성 Dockerfile은 `package.json` + `pnpm-lock.yaml`만 COPY한다.  
**예전 lockfile**에 `patchedDependencies`가 있으면 `patches/` 파일을 찾다 실패한다.

Digilog fork `master` (`c89f48c3` 이후)에서는 **lockfile에서 패치를 제거**했다.

같은 오류가 나면:

1. **저장소가 `digilog-labs/paperclip`인지** 확인 (`paperclipai/paperclip` 아님 — upstream은 패치 유지)
2. **브랜치 `master`**, 최신 커밋 배포
3. Cloudtype **빌드 캐시 삭제** 후 재배포 (로그에 `#9 CACHED`만 보이면 캐시 의심)

### 해결 A — 소스 배포 유지 (권장)

캐시 비우고 **최신 master** 재배포.

### 해결 B — 최소 Dockerfile (한 번만 설정)

자동 빌드가 계속 실패하면:

| 설정 | 값 |
|------|-----|
| Dockerfile 경로 | `Dockerfile.cloudtype` |

전체 repo를 COPY하므로 lockfile·패치 불일치가 나지 않는다. 커스터마이징은 env/런타임으로 하면 된다.

## 런타임 환경 변수

```env
DATABASE_URL=postgresql://...@...pooler.supabase.com:5432/postgres
BETTER_AUTH_SECRET=<랜덤>
PORT=3100
SERVE_UI=true
PAPERCLIP_DEPLOYMENT_MODE=authenticated
PAPERCLIP_DEPLOYMENT_EXPOSURE=private
```

빌드 시 `--build-arg DATABASE_URL` 불필요 (런타임만).

## 마이그레이션

Supabase는 배포 전/후 한 번:

```bash
# 로컬에서 .env 로드 후
pnpm db:migrate
```

또는 Cloudtype 일회성 작업으로 동일 명령.
