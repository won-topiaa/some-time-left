# 자투리 시간

약속 3분 전에 도착하는 길을 찾아주는 앱인토스 미니앱.
(저장소와 `appName`은 `some-time-left`, 영어 이름은 `Some Time Left`.)

가장 빠른 길이 아니라, **약속 시각 3분 전에 도착하는 길**을 찾는다.
20분이면 닿는 곳에 30분이 남았을 때, 카페에 들어가기도 애매하고 그냥 서 있기도 뻘쭘한
그 시간을 걷기로 채운다.

사용자는 경사·경치·혼잡도 같은 조건을 고르지 않는다. **기분만 고르면 나머지는 앱이 정한다.**

## 지금 상태

| 영역 | 상태 |
|---|---|
| 도메인 로직 (시간 예산·그늘·기분 매핑·경로 랭킹·페이스) | 구현 완료 |
| 화면 6개 (입력 → 기분 → 경로 → 걷기 → 도착, 그리고 지나온 길) | 구현 완료, iOS/Android 번들 빌드 성공 |
| 테스트 | 337개 통과 (앱 + 프록시) |
| 도보 경로 (TMAP 보행자 경로안내) | 연동 완료, **응답 구조 문서 대조 완료** |
| 목적지 검색 (TMAP POI + TMAP 지오코딩) | 연동 완료 |
| 목적지 혼잡도 (TMAP Puzzle) | 연동 완료 — 응답 구조 1회 확인 필요 |
| 혼잡도·공원·건물 높이 데이터 | 연동 완료 — 키 없으면 해당 성질만 중립값 |
| 혼잡도 프록시 | **배포 완료** (Cloudflare Workers) — 서울까지 실측 확인 |
| 앱 아이콘 | `assets/icon.png` (1024×1024) — `python3 scripts/make-icon.py`로 생성 |
| 콘솔 노출 자료 | 로고 600×600 라이트/다크, 스크린샷 세로 6장·가로 1장 — `assets/store/` |
| 앱인토스 배포 | `ait build` 성공 (압축 해제 14.9MB / 한도 100MB) — 콘솔 등록 진행 중 ([`docs/release.md`](docs/release.md)) |

## 명령어

모든 명령은 저장소 폴더 안에서 친다. `ait`은 전역 명령이 아니라
`node_modules/.bin`에만 있으므로 직접 부를 때는 `npx ait`이다.

```bash
npm install
npm test          # 도메인·파싱 테스트 (네이티브 런타임·네트워크 불필요)
npm run typecheck
npm run dev       # granite dev — 토스 앱에서 열어 확인
npm run build        # ait build — 배포용 some-time-left.ait 생성
npm run build:bundle # granite build — 번들만 빠르게 확인 (.ait은 안 나옴)
npm run deploy       # ait build + ait deploy. 콘솔 등록과 ait token add가 먼저다
npm run store-shots   # 콘솔에 올릴 스크린샷 (assets/store/)
npm run check-config  # 키·아이콘 주소·스토어 그림 규격을 실제로 확인
```

배포 절차는 [`docs/release.md`](docs/release.md)에 있다.
`ait deploy`는 빌드를 하지 않고 이미 있는 `.ait`을 올리기만 해서,
`npm run deploy`가 `predeploy`로 빌드를 먼저 돌리게 묶어 뒀다.

## 구조

```
src/
  domain/            순수 로직. React Native에 의존하지 않아 CI에서 그대로 테스트된다.
    time.ts          "3분 전 도착" → 시간 예산. 이 앱의 출발점.
    sun.ts           태양 고도·방위각 (NOAA 근사)
    shade.ts         그늘길 계산
    mood.ts          기분 → 경로 가중치 (사용자에게 비노출)
    route-plan.ts    후보 경로 랭킹
    pace.ts          걷는 중 페이스 코칭
    copy.ts          추천 이유·프롬프트 문구
  data/
    route-provider.ts    경로 공급자 인터페이스 + mock
    tmap-route-provider.ts  TMAP 기반 실제 구현
    tmap/                TMAP 클라이언트와 순수 파서
    seoul/               서울 실시간 인구데이터 (혼잡도) + 순수 스코어러
    parks/               도시공원 표준데이터 + 경치 스코어러
    buildings/           브이월드 건물(공간) · 건축물대장(주소) · 도로 단면
    environment.ts       위 셋을 한 번에 모으는 계층
    places.ts            목적지 검색 (POI + 지오코딩 통합)
    waypoints.ts         우회 경유지 생성 휴리스틱
    features.ts          실제 경로 → RouteFeatures
    records.ts           걸은 길·한 줄 기록 저장 (앱인토스 Storage)
  state/             화면 간 상태, 경로 추천 훅
  pages/             파일 기반 라우팅 화면 6개
  ui/                테마, 안전 영역, 기분 색, 경로 미리보기(SVG)

proxy/               혼잡도 HTTPS 프록시 (의존성 없음)
  src/seoul.ts       서울 업스트림 + 응답 정규화
  src/handler.ts     요청 처리 (웹 표준 Request/Response)
  src/server.ts      Node 진입점
  src/worker.ts      Cloudflare Workers 진입점
```

## 설계에서 물러서지 않을 것 세 가지

**3분은 설정값이 아니다.** `ARRIVE_EARLY_SEC` 상수로 고정하고 UI에서 바꾸게 하지 않는다.
5분도 10분도 아닌 3분이라는 임의적이고 구체적인 숫자가 이 제품의 정체성이다.

**추천 이유 한 줄이 없으면 자동 추천은 실패한다.** 자동 추천의 신뢰는 정확도가 아니라
설명에서 나온다. `copy.ts`의 `routeReason()`이 그 역할을 하고, 화면의 주인공은 지도가
아니라 이 문장이다.

**조건 선택은 입구가 아니라 출구에 둔다.** 기분을 고르면 앱이 정하고, 틀렸을 때
"다른 길로 보여주세요"로 빠져나간다. 출발 전에 경사·혼잡도를 고르게 하는 순간
이 앱은 불안 관리 앱이 아니라 경로 계산기가 된다.

## 그늘길

한국 여름의 킬러 기능. 별도 데이터 없이 계산으로 만든다.

높이 `H`인 건물은 태양 고도 `h`에서 길이 `H / tan(h)`의 그림자를 드리운다.
그중 **길을 가로지르는 성분만** 보행자에게 그늘이 된다.

```
가로 성분 = (H / tan h) × |sin(태양 방위각 − 도로 방위각)|
그늘 비율 = clamp(가로 성분 / 도로 폭, 0, 1)
```

길과 나란히 뻗은 그림자는 소용이 없고, 그림자를 드리우는 쪽은 항상 해가 있는 쪽 건물이다.
20~40분을 걷는 동안 해도 움직이므로 `routeShadeOverTime()`은 구간을 지나는 예상 시각마다
태양 위치를 다시 계산한다. 늦은 오후에 특히 차이가 크다.

한여름 한낮(`isShadeWorthy()`)에는 사용자가 "햇볕이 싫어요"를 고르지 않아도 모든 기분에
그늘 가중치를 얹는다 — 말하지 않아도 더운 건 사실이니까.

## 도보 경로 — 왜 네이버가 아니라 TMAP인가

**네이버 클라우드 플랫폼은 도보 경로 API를 제공하지 않는다.** Directions 5/15는 자동차
전용이고, 보행자 경로는 아직 공개되지 않았다. 그래서 각자 잘하는 것만 쓴다.

| 하는 일 | 쓰는 API |
|---|---|
| 도보 경로 + 경유지 우회 | **TMAP 보행자 경로안내** (`/tmap/routes/pedestrian`) |
| 장소 이름 검색 ("성수동 어니언") | **TMAP POI 검색** (`/tmap/pois`) |
| 주소 → 좌표 ("테헤란로 152") | **TMAP 지오코딩** (`/tmap/geo/fullAddrGeo`) |

### 후보 경로를 만드는 방법

정식 최적화(Arc Orienteering Problem)는 NP-hard라 모바일에서 실시간으로 못 푼다. 대신:

1. 최단 경로를 한 번 부른다 — 시간 예산의 기준점
2. 목표 시간에 맞는 **우회 폭을 닫힌 형태로 추정**한다
   경유지를 옆으로 `d`만큼 밀면 경로는 `2 × √((L/2)² + d²)`가 되므로, 목표 길이 `T`에서
   `d = √((T/2)² − (L/2)²)`
3. 좌우 양쪽 × 선분 위 여러 지점에 경유지를 찍어 6개를 병렬 요청한다
4. 실제 소요 시간은 TMAP이 알려주므로 우리는 랭킹만 한다
5. 결과가 목표에서 2분 넘게 벗어나면 배율을 보정해 한 번 더 시도한다

도로망은 직선이 아니라 첫 추정이 빗나가는 게 정상이고, 그래서 보정 단계가 있다.

### API 키를 어디에 넣나

**`src/config.local.ts`** 하나에 몰아넣는다. 이 파일은 **커밋되지 않고**(.gitignore),
없으면 `npm run dev`·`build`·`typecheck` 전에 자동으로 만들어진다.

```ts
export const localSecrets = {
  tmapAppKey: 'xxx',              // 경로·검색·지오코딩
  congestionProxyToken: 'xxx',    // proxy/.env의 PROXY_TOKEN과 같은 값
  publicDataServiceKey: null,
  vworldKey: null,
};
```

`_app.tsx`는 이 값을 읽어 `configureApi()`에 넘길 뿐이라 **손댈 일이 없다** —
`git pull` 때 충돌하지도, 실수로 키를 올리지도 않는다.

파일을 직접 열 필요는 없다. 물어보고 대신 써 준다 (입력은 화면에 안 찍힌다):

```bash
npm run set-key tmap        # 또는 publicdata / vworld
npm run set-key             # 목록에서 고르기
npm run link-proxy          # 프록시 토큰은 proxy/.env에서 자동으로
```

**잘 들어갔는지는 `typecheck`로 알 수 없다** — 값이 `null`이어도 통과한다.
설정한 키를 **실제로 호출해서** 확인하려면:

```bash
npm run check-config
```

```
  ✓ 혼잡도 프록시        강남역 보통
  ✓ TMAP 장소검색       1건 조회됨
  ✗ 장소 혼잡도          INVALID_API_KEY — 상품 사용 신청이 필요할 수 있어요
  – 공공데이터 공원        키가 없어 건너뜀
```

키마다 실패 원인이 다르므로 무엇을 해야 하는지까지 알려준다 —
공공데이터는 Decoding 키인지, 브이월드는 레이어 아이디와 도메인 등록인지.
비밀값은 출력하지 않고 길이만 보여준다.

값이 없으면 그 기능만 꺼지고 앱은 계속 돈다. TMAP 키가 없으면 경로가 mock으로,
프록시 토큰이 없으면 `quiet`이 중립값으로 떨어진다.

**클라이언트 번들에 들어간 값은 뜯으면 나온다.** `src/config.local.ts`의 값은
`_app.tsx`가 읽어 쓰므로 빌드하면 그대로 번들에 박힌다 — TMAP 키, 공공데이터 인증키,
브이월드 키, 프록시 토큰 넷 다 그렇다. 모바일 앱의 클라이언트 키는 원래 그런 것이라
비밀로 지키는 대신 **발급처에서 제한을 건다**(브이월드는 등록 도메인, TMAP은 사용량).

번들에 넣을 수 없는 건 따로 뺀다. 서울 실시간 인구데이터 인증키가 그것이고,
[`proxy/`](proxy/README.md)에만 있다. 앱이 들고 있는 프록시 토큰은 그 키가 아니라
프록시 문을 여는 값이고, 그건 벽이 아니라 문턱이다.

## 지금 진짜 계산되는 것 / 아직 아닌 것

`RouteFeatures` 6개 중 실제 데이터로 계산되는 건 넷이다. 없는 건 있는 척하지 않고
중립값(0.5)으로 두고 `src/data/features.ts`에 표시해 뒀다.

그늘도 마찬가지다. 건물을 하나도 못 받으면 모든 구간이 기본 단면(양옆 15m)으로 떨어지는데,
그대로 계산하면 남북 길 0.03 / 동서 길 0.36처럼 그럴듯한 값이 나온다. 길의 방위는
진짜지만 양옆 벽은 지어낸 것이라 그 숫자로 길을 고르면 근거 없는 추천이 된다 —
그래서 건물이 없으면 중립값으로 둔다.

| 성질 | 출처 | 키 없을 때 |
|---|---|---|
| `unbroken` | TMAP 횡단보도 개수 | — |
| `flat` | TMAP 계단·육교 개수 (진짜 경사는 DEM 필요) | — |
| `novelty` | 사용자 본인의 걷기 기록 | — |
| `quiet` | 서울시 실시간 인구데이터 (프록시 경유, **동작 확인**) | 0.5 |
| `scenic` | 전국도시공원표준데이터 (공원·수변 근접) | 0.5 |
| `shade` | 태양 위치 × 브이월드 건물 층수 | 0.5 |

도로 폭만 아직 기본값(12m)이다. 도로망 데이터를 붙이면 `DEFAULT_STREET_PROFILE`을
대체하면 된다.

### 왜 건물 높이를 건축물대장이 아니라 브이월드에서 얻나

**건축물대장 API는 좌표로 조회할 수 없다.** 시군구코드·법정동코드·번·지가 있어야 한다.
경로 하나에 건물이 수백 채인데 좌표마다 역지오코딩을 돌려 대장을 부르는 건 현실적이지
않다. 그래서 공간 질의(BBox)가 되는 브이월드로 한 번에 긁고, 건축물대장은 주소를 아는
건물 하나를 정밀하게 볼 때만 쓴다 (`src/data/buildings/ledger.ts`).

대장의 `heit`은 0으로 들어오는 경우가 흔해서, 0이면 층수 × 3.3m로 환산한다.

### 가는 길에 스치는 가게 (곁의 가게)

경로가 정해지면 **그 길 곁에 있는 가게 한 곳**을 조용히 한 줄 얹는다.

> 가는 길에 △△, 잠깐 들러도 좋고요

목적이 아니라 곁에 있다고 알려주는 정도다. 우연히 지나치다 들르는 가게라는
감성이라 **딱 하나**만, 그리고 **없으면 없는 채로** 둔다 — 억지로 만들면 우연이
아니게 된다.

- 소스는 **TMAP POI 검색**(좌표 기반)이다. 경로 위에 실제로 뭐가 있는지는 좌표
  질의라야 안다. Puzzle(음식점·혼잡도)은 지역 통계라 "지금 한산한 카페처럼"
  꾸미는 데 나중에 쓸 수 있고, 여기선 소스로 쓰지 않는다.
- 범주는 `QUICK_STOP_CATEGORIES`(카페·베이커리·디저트) — 앉아 밥 먹는 식당이
  아니라 3~5분 스쳐 들르는 곳.
- 고르는 법(`pickAlongRoute`, 순수 함수): 길에서 45m 안, 양 끝을 뺀 가운데,
  그중 **가장 길 한복판**에 가까운 하나. 무작위가 아니라 결정적 — 같은 길엔
  같은 가게가 떠오른다.

### 목적지 혼잡도 (TMAP Puzzle)

TMAP 장소 혼잡도는 **대형 쇼핑시설 200여 곳**만 다룬다(스타필드, 롯데월드몰,
백화점, 대형마트). 그래서 "이 길이 한적한가"인 `quiet`에는 쓸 수 없다 —
그건 지역 단위인 서울 실시간 인구데이터가 맡는다.

대신 **약속 장소가 마침 그런 곳일 때** 도착 화면에 한 줄 얹는다.

> "롯데월드몰, 지금 붐벼요." (남은 시간은 바로 위 큰 숫자가 말한다)

목록에 없는 장소가 대부분이므로 없으면 조용히 생략한다. 검색으로 고른 목적지는
`poiId`로, 지오코딩으로 온 목적지는 이름 정규화로 맞춘다.

| 경로 | 확인 |
|---|---|
| `GET /puzzle/place/meta/pois` | 문서 + `INVALID_API_KEY` |
| `GET /puzzle/place/congestion/rltm/pois/{poiId}` | `INVALID_API_KEY` |

혼잡도 **응답 구조는 미확인이다.** Puzzle 계열의 통상적 형태(`contents.rltm[0]`)와
평탄한 형태를 모두 받도록 열어 두었고, 못 읽으면 null이라 화면에서 생략된다.

### 상품별 사용 신청이 따로 필요하다

SK open API는 **앱 키가 앱 단위로 발급되고, 상품마다 "사용 신청"을 따로 해야 한다.**
신청할 때 그 상품을 포함할 앱을 선택한다. 지도·경로가 되더라도 Puzzle 장소 혼잡도는
별도 신청이 필요하다. 세금계산서가 필요하면 사업자 회원이어야 하고, 개인 → 사업자
전환은 가능하지만 되돌릴 수 없다.

### 경로 존재 여부를 오류 코드로 알아내기

TMAP 게이트웨이는 **있는 경로에 `INVALID_API_KEY`, 없는 경로에
`MISSING_AUTHENTICATION_TOKEN`** 을 준다. 키 없이도 경로를 검증할 수 있어서
`/puzzle/place/congestion/rltm/pois/{poiId}`를 이 방법으로 찾아냈다.

```bash
curl -s -H "appKey: invalid" "https://apis.openapi.sk.com<경로>" | grep -o '"code":"[A-Z_]*"'
```

### 혼잡도의 한계

서울시 실시간 인구데이터는 **주요 120여 곳만** 다루고 한 번에 한 곳씩만 조회된다.
그래서 경로가 지나는 장소를 먼저 추리고(`hotspotsAlong`) 그 장소들만 병렬로 부른다.
`src/data/seoul/hotspots.ts`의 장소 목록은 **씨앗 10곳**이고, 전체 목록은 서울
열린데이터광장에서 받아 대체해야 한다. 목록에 없는 동네는 중립값으로 떨어진다.

## API 키 발급처

| 무엇 | 어디서 | 없으면 |
|---|---|---|
| **TMAP** appKey | [openapi.sk.com](https://openapi.sk.com) → 앱 등록 | 경로 자체가 mock |
| 서울 열린데이터광장 | [data.seoul.go.kr](https://data.seoul.go.kr) → 인증키 신청 | `quiet` 중립값 |
| (서울 키는 앱이 아니라 [`proxy/`](proxy/README.md)에 넣는다) | | |
| 공공데이터포털 | [data.go.kr](https://www.data.go.kr) → 활용신청 | `scenic` 중립값 |
| 브이월드 | [vworld.kr](https://www.vworld.kr) → 오픈API 인증키 | `shade` 기본 높이 |

공공데이터포털은 인증키 하나로 두 API를 쓴다 — 전국도시공원표준데이터, 국토교통부
건축물대장정보 서비스. 각각 "활용신청"을 따로 눌러야 한다. Encoding/Decoding 키가
따로 나오는데 `URLSearchParams`가 인코딩하므로 **Decoding 키**를 넣는다.

브이월드는 인증키 발급 시 **사용 도메인 등록**이 필요하다.

### 브이월드 레이어 아이디·층수 속성명 찾기

문서를 뒤지는 것보다 실제 응답을 보는 쪽이 확실하다. 키를 받으면:

```bash
node scripts/discover-vworld.mjs <VWORLD_KEY>
```

강남역 근처 작은 상자로 후보 레이어들을 하나씩 조회해서, 응답이 오는 레이어의
**속성 이름을 전부 출력하고 층수로 보이는 것을 짚어준다.** 그대로
`src/config.ts`의 `vworld.buildingLayer` / `vworld.floorField`에 넣으면 된다.

후보 중에 맞는 게 없으면 브이월드 사이트에서 레이어 아이디를 찾아 인자로 넘긴다:

> vworld.kr → 오픈API → 2D 데이터 API → 데이터 제공목록 → (건물 레이어) → 속성정보

```bash
node scripts/discover-vworld.mjs <VWORLD_KEY> <레이어아이디>
```

> 엔드포인트 경로는 전부 `src/config.ts`의 설정값이다. 공공데이터 API는 문서마다
> 표기가 다르고 경로가 바뀌기도 해서, 키를 받은 뒤 한 번 실측하고 안 맞으면 코드가
> 아니라 설정만 고치면 된다.

### 응답 구조 확정하기

파서 세 개(경로·지오코딩·혼잡도)는 **경로만 확인됐고 응답 필드는 실측 전이라**
방어적으로 쓰여 있다. TMAP 키가 있으면 한 번에 확인할 수 있다.

```bash
npm run probe-tmap
```

다섯 엔드포인트(보행자 경로·POI 검색·지오코딩·혼잡도 목록·실시간 혼잡도)를 호출해
**응답의 구조만** 출력한다 — 필드 이름과 타입, 짧게 자른 예시 값. **앱 키는 출력에
찍히지 않으므로** 결과를 그대로 공유해도 안전하다.

이걸로 확정할 것:

| 파서 | 확인할 것 |
|---|---|
| `parsePedestrianResponse` | `totalTime`/`totalDistance` 위치, 횡단보도·계단을 가리키는 필드 |
| `parsePoi` | POI ID 필드가 `id`인지 다른 이름인지 |
| `parseFullAddrGeo` | 도로명 매칭 시 `newLat`/`newLon`, 지번 시 `lat`/`lon`이 맞는지 |
| `parseCongestion` | 혼잡도 등급 필드 이름과 값의 범위(1~4인지 0~1인지) |

### 엔드포인트 검증 상태

무효한 키로 호출해 응답을 보고 확인했다. `INVALID_API_KEY`나
`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 오면 경로는 맞고 키만 없다는 뜻이다.

**TMAP은 경로 존재 여부를 오류 코드로 구분해준다** — 있는 경로는 `INVALID_API_KEY`,
없는 경로는 `MISSING_AUTHENTICATION_TOKEN`. 없는 경로(`/tmap/geo/thisdoesnotexist`)로
대조군을 확인했다. 이 방법으로 확인한 geo 계열: `fullAddrGeo`, `geocoding`,
`reversegeocoding`, `postcode`는 존재하고 `convertcoordinate`는 없다.

| 경로 | 상태 |
|---|---|
| TMAP `POST /tmap/routes/pedestrian?version=1` | **확인** — `INVALID_API_KEY` |
| TMAP `GET /tmap/pois?version=1` | **확인** — `INVALID_API_KEY` |
| 도시공원 `api.data.go.kr/openapi/tn_pubr_public_cty_park_info_api` | **확인** — 활용신청 상세의 End Point 표기 (s 없음) |
| 건축물대장 `apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo` | **확인** — 구버전 `BldRgstService_v2`는 폐기됨 |
| TMAP `GET /tmap/geo/fullAddrGeo` | **확인** — `INVALID_API_KEY` |
| 서울 실시간 인구데이터 | **확인** — 실제 키로 4개 지역 조회 성공 |
| 브이월드 건물 레이어 아이디·층수 속성명 | **미확인** — 아래 참고 |

찾은 오류 세 가지:
- **도시공원 표준데이터의 End Point는 `api.data.go.kr`(s 없음)이다.**
  처음엔 `apis.data.go.kr`(s 있음)로 불렀는데, 같은 키인데도 계속
  `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 났다. 게이트웨이가 서로 다르다 —
  data.go.kr 활용신청 상세에 적힌 End Point 표기로 확인하고 고쳤다.
  건축물대장(현재 미사용)은 여전히 `apis.data.go.kr` 쪽이라, 되살릴 땐 호스트를 따로 둔다.
- 건축물대장 `BldRgstService_v2`는 폐기됐다(`NO_OPENAPI_SERVICE_ERROR`).
  `BldRgstHubService`가 살아 있다.
- 공공데이터포털이 주는 "Encoding 키"와 "Decoding 키"는 별개의 키가 아니라
  같은 키의 다른 표기다. 코드가 `URLSearchParams`로 다시 인코딩하므로 저장은
  디코딩된 형태여야 하고, 어느 쪽을 붙여넣든 되도록 `normalizeServiceKey()`가 맞춘다.

### 브이월드가 확인되지 않은 이유

`api.vworld.kr`은 TLS 종단이 vworld 실서버다(인증서 `CN=*.vworld.kr`, GlobalSign
발급, 검증 통과). 그런데 API 경로든 없는 경로든 루트든 **모든 요청이 502**를
반환한다. 없는 경로가 404가 아니라 502라는 건 라우팅 이전에서 실패한다는 뜻이라,
레이어 아이디 문제가 아니라 vworld 쪽 문제로 보인다.

`scripts/discover-vworld.mjs`는 이 경우를 따로 구분해 알려준다.

### 서울 API는 HTTPS를 아예 안 받는다 → 프록시로 해결

`openapi.seoul.go.kr`의 443과 8088 양쪽에 TLS 핸드셰이크를 시도하면 둘 다
`Connection reset by peer`로 끊긴다. 평문 HTTP 전용이다.

iOS의 App Transport Security는 평문 HTTP를 기본 차단한다. 즉 **토스 앱 안에서 이
주소를 직접 호출하면 실패한다.** 혼잡도(`quiet`)를 쓰려면 자체 HTTPS 프록시가
선택이 아니라 필수다. 키 보호를 위해 어차피 필요했던 그 프록시다.

그래서 [`proxy/`](proxy/README.md)에 얇은 HTTPS 프록시를 두었다. 앱은 서울을
직접 부르지 않고 프록시를 부른다. **인증키는 프록시에만 있고 앱 번들에는 없다.**

프록시는 여러 장소를 한 번에 받아(`?area=A&area=B`) 병렬 조회하므로, 서울 API가
한 번에 한 곳씩만 받는 제약도 앱 입장에서는 왕복 한 번으로 끝난다.

```ts
configureApi({
  congestionProxy: { baseUrl: 'https://<배포한 주소>', token: '<PROXY_TOKEN>' },
});
```

`baseUrl`이 없으면 혼잡도를 건너뛰고 `quiet`은 중립값이 된다 — 프록시가 죽어도
경로 추천은 계속된다.

## 다음에 붙일 것

1. **ETA 정확도 측정.** 경로 품질보다 먼저다. ±3분을 못 맞추면 컨셉 자체가 성립하지 않는다.
   TMAP `totalTime`이 신호등 대기를 얼마나 반영하는지부터 실측해야 한다.
2. **엔드포인트 실측.** 키를 받으면 공공데이터 API 응답 형태를 한 번 확인하고
   `src/config.ts`를 맞춘다. 브이월드 건물 레이어 아이디와 층수 속성명이 특히 그렇다.
3. **서울 장소 목록 전체 반영** — `hotspots.ts`의 씨앗 10곳을 120여 곳으로.
4. **도로 폭 데이터** — 그늘 계산의 마지막 기본값.
5. **경사(DEM)** — `flat`을 계단 개수라는 대리 지표에서 진짜 경사로.
6. **기록의 장소 기반 회수.** 예전에 걸은 길의 그 지점을 다시 지날 때
   "여기서 그때 이런 생각 하셨네요". 반드시 옵트인.

## 문서

- [`docs/market-research.md`](docs/market-research.md) — 경쟁 지형, 화이트스페이스, 감성 진단
- [`docs/concept-decisions.md`](docs/concept-decisions.md) — 확정된 제품 결정과 그 근거
- [`docs/release.md`](docs/release.md) — 앱인토스 콘솔 등록과 배포 절차
