# 혼잡도 프록시

서울 실시간 인구데이터를 앱이 부를 수 있게 감싸는 얇은 HTTPS 프록시.

## 왜 필요한가

서울 열린데이터광장의 실시간 인구데이터는 **평문 HTTP 전용이다.**
`openapi.seoul.go.kr`의 443과 8088 양쪽에 TLS 핸드셰이크를 시도하면 둘 다
`Connection reset by peer`로 끊긴다 — HTTPS를 아예 받지 않는다.

iOS의 App Transport Security는 평문 HTTP를 기본 차단한다. 즉 **토스 앱 안에서
서울 API를 직접 호출하면 실패한다.** 이 프록시가 그 사이를 메운다.

덤으로 두 가지가 따라온다.

- **인증키가 앱 번들에 들어가지 않는다.** 키는 이 서버에만 있다.
- **왕복이 한 번으로 준다.** 서울 API는 한 번에 한 장소씩만 받지만,
  이 프록시는 `?area=A&area=B`로 여러 곳을 받아 병렬 조회한다.

## API

```
GET /health
  → { "ok": true, "cached": 3 }

GET /population?area=광화문·덕수궁&area=강남역
  → { "areas": [
        { "areaName": "광화문·덕수궁", "level": "보통", "updatedAt": "2026-08-18 03:20" },
        { "areaName": "강남역", "level": "붐빔", "updatedAt": "2026-08-18 03:20" }
      ] }
```

`level`은 `여유` · `보통` · `약간 붐빔` · `붐빔` 넷 중 하나다.
못 읽은 장소는 목록에서 빠진다 — 하나 실패해도 나머지는 쓸 수 있어야 하니까.

응답은 **정규화된 작은 형태**다. 서울 쪽 스키마가 바뀌어도 앱이 아니라
이 프록시만 고치면 된다.

## 환경 변수

| 이름 | 필수 | 기본값 | 설명 |
|---|---|---|---|
| `SEOUL_OPEN_DATA_KEY` | ✅ | — | 서울 열린데이터광장 인증키 |

`.env` 파일에 넣으면 `npm run dev` · `start` · `check`가 알아서 읽는다
(`.env.example` 참고). `.env`는 커밋되지 않는다.

| `PROXY_TOKEN` | ✅ | — | `Authorization: Bearer <token>`으로 요구. `npm run gen-token`으로 만든다 |
| `ALLOW_ANONYMOUS` | | 없음 | `true`면 토큰 없이 연다 (권장하지 않음) |
| `SEOUL_BASE_URL` | | `http://openapi.seoul.go.kr:8088` | 업스트림 |
| `CACHE_TTL_MS` | | `300000` (5분) | 서울이 5분 단위로 갱신하므로 그에 맞춤 |
| `UPSTREAM_TIMEOUT_MS` | | `6000` | 업스트림 타임아웃 |
| `MAX_AREAS` | | `12` | 한 요청에서 조회할 장소 수 상한 |
| `PORT` | | `8787` | Node 서버 포트 |

**토큰 없이는 프록시가 뜨지 않는다.** 실수로 열린 채 배포되는 일이 없도록 기본이
'막힘'이다. 토큰이 없으면 주소를 아는 누구나 이 프록시를 통해 서울 인증키
할당량을 쓸 수 있기 때문이다.

```bash
cd proxy
npm run gen-token
```

정말 열어두려면 `ALLOW_ANONYMOUS=true`를 명시해야 한다 — 실수가 아니라 선택이
되도록.

## 실행

### Node (Fly · Railway · Render · EC2 등)

```bash
cd proxy
npm install                # 의존성은 없지만 스크립트를 쓰려면 한 번
npm run setup              # 인증키를 물어보고 .env를 만들어 준다
npm run check              # 인증키가 살아 있는지 확인
npm run build
npm start
```

`npm run setup`이 인증키를 물어보고(화면에 찍히지 않는다) `PROXY_TOKEN`은 알아서
만들어 `.env`에 쓴다. 파일을 직접 열 필요가 없다. 손으로 하고 싶으면
`cp .env.example .env` 후 편집해도 된다.

`npm run check`는 서버를 띄우지 않고 **프록시가 실제로 쓰는 코드 경로로** 네 곳을
조회해 본다. 키가 유효한지, 응답이 우리 파서와 맞는지 한 번에 드러난다.
인증키는 출력에 찍히지 않는다.

```
  ✓ 광화문·덕수궁      보통 (2026-08-18 03:20)
  ✓ 강남역            붐빔 (2026-08-18 03:20)
```

이 프로세스는 평문 HTTP를 듣는다. **HTTPS 종단은 앞단(플랫폼 로드밸런서나 nginx)이
맡는 것을 전제로 한다** — 위 플랫폼들은 기본으로 HTTPS를 붙여준다.

개발 중에는 빌드 없이:

```bash
npm run dev    # .env를 자동으로 읽는다
```

### Cloudflare Workers

`src/worker.ts`가 진입점이다. 핸들러는 Node 버전과 같은 것을 쓴다.

```bash
npx wrangler deploy proxy/src/worker.ts --name some-time-left-proxy
npx wrangler secret put SEOUL_OPEN_DATA_KEY
npx wrangler secret put PROXY_TOKEN
```

무료 티어로 충분하고 HTTPS가 기본이다. 다만 서울 업스트림이 평문 HTTP라
배포 환경에서 `http://` 아웃바운드가 막히면 Node 쪽으로 옮기면 된다 —
핸들러가 같아서 옮기는 비용이 거의 없다.

## 앱에 연결하기

`src/_app.tsx`의 `configureApi`에 프록시 주소를 넣는다.

```ts
configureApi({
  congestionProxy: {
    baseUrl: 'https://<배포한 주소>',
    token: '<PROXY_TOKEN을 걸었다면 같은 값>',
  },
});
```

`baseUrl`이 없으면 혼잡도 조회를 건너뛰고 `quiet`은 중립값(0.5)이 된다.
프록시가 죽어도 경로 추천은 계속된다.

## 확인

```bash
curl https://<배포한 주소>/health
curl -H "Authorization: Bearer <token>" \
  "https://<배포한 주소>/population?area=%EA%B0%95%EB%82%A8%EC%97%AD"
```
