# 썸 타임 레프트

약속 3분 전에 도착하는 길을 찾아주는 앱인토스 미니앱.

가장 빠른 길이 아니라, **약속 시각 3분 전에 도착하는 길**을 찾는다.
20분이면 닿는 곳에 30분이 남았을 때, 카페에 들어가기도 애매하고 그냥 서 있기도 뻘쭘한
그 시간을 걷기로 채운다.

사용자는 경사·경치·혼잡도 같은 조건을 고르지 않는다. **기분만 고르면 나머지는 앱이 정한다.**

## 지금 상태

| 영역 | 상태 |
|---|---|
| 도메인 로직 (시간 예산·그늘·기분 매핑·경로 랭킹·페이스) | 구현 완료 |
| 화면 5개 (입력 → 기분 → 경로 → 걷기 → 도착) | 구현 완료, iOS/Android 번들 빌드 성공 |
| 테스트 | 127개 통과 (도메인 + 파싱/휴리스틱/스코어러) |
| 도보 경로 (TMAP 보행자 경로안내) | 연동 완료 — 키 넣으면 동작, 없으면 mock으로 폴백 |
| 목적지 검색 (TMAP POI + 네이버 지오코딩) | 연동 완료 |
| 혼잡도·공원·건물 높이 데이터 | 연동 완료 — 키 없으면 해당 성질만 중립값 |
| 앱인토스 배포 | 미등록 (콘솔에서 미니앱 생성 필요) |

## 명령어

```bash
npm install
npm test          # 도메인·파싱 테스트 (네이티브 런타임·네트워크 불필요)
npm run typecheck
npm run dev       # granite dev — 토스 앱에서 열어 확인
npm run build     # iOS/Android 번들 빌드
npm run deploy    # ait deploy — 콘솔 등록 후 사용 가능
```

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
    naver/geocode.ts     네이버 지오코딩 (주소 → 좌표)
    seoul/               서울 실시간 인구데이터 (혼잡도) + 순수 스코어러
    parks/               도시공원 표준데이터 + 경치 스코어러
    buildings/           브이월드 건물(공간) · 건축물대장(주소) · 도로 단면
    environment.ts       위 셋을 한 번에 모으는 계층
    places.ts            목적지 검색 (POI + 지오코딩 통합)
    waypoints.ts         우회 경유지 생성 휴리스틱
    features.ts          실제 경로 → RouteFeatures
    records.ts           한 줄 기록 저장 (앱인토스 Storage)
  state/             화면 간 상태, 경로 추천 훅
  pages/             파일 기반 라우팅 화면 5개
  ui/                테마, 경로 미리보기(SVG)
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
| 주소 → 좌표 ("테헤란로 152") | **네이버 지오코딩** (`/map-geocode/v2/geocode`) |

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

### API 키

`configureApi()`로 런타임에 주입한다 (`src/_app.tsx`). 키가 없으면 자동으로 mock
경로로 떨어지므로 키 없이도 화면 개발이 막히지 않는다.

**클라이언트 번들에 들어간 키는 그대로 노출된다.** 실서비스에서는 `baseUrl`을 자체 서버
프록시로 돌리고 키는 서버에만 둔다. `src/config.ts`가 그렇게 바꿀 수 있게 열려 있다.

## 지금 진짜 계산되는 것 / 아직 아닌 것

`RouteFeatures` 6개 중 실제 데이터로 계산되는 건 넷이다. 없는 건 있는 척하지 않고
중립값(0.5)으로 두고 `src/data/features.ts`에 표시해 뒀다.

| 성질 | 출처 | 키 없을 때 |
|---|---|---|
| `unbroken` | TMAP 횡단보도 개수 | — |
| `flat` | TMAP 계단·육교 개수 (진짜 경사는 DEM 필요) | — |
| `novelty` | 사용자 본인의 걷기 기록 | — |
| `quiet` | 서울시 실시간 인구데이터 (혼잡도) | 0.5 |
| `scenic` | 전국도시공원표준데이터 (공원·수변 근접) | 0.5 |
| `shade` | 태양 위치 × 브이월드 건물 층수 | 기본 높이 15m로 계산 |

도로 폭만 아직 기본값(12m)이다. 도로망 데이터를 붙이면 `DEFAULT_STREET_PROFILE`을
대체하면 된다.

### 왜 건물 높이를 건축물대장이 아니라 브이월드에서 얻나

**건축물대장 API는 좌표로 조회할 수 없다.** 시군구코드·법정동코드·번·지가 있어야 한다.
경로 하나에 건물이 수백 채인데 좌표마다 역지오코딩을 돌려 대장을 부르는 건 현실적이지
않다. 그래서 공간 질의(BBox)가 되는 브이월드로 한 번에 긁고, 건축물대장은 주소를 아는
건물 하나를 정밀하게 볼 때만 쓴다 (`src/data/buildings/ledger.ts`).

대장의 `heit`은 0으로 들어오는 경우가 흔해서, 0이면 층수 × 3.3m로 환산한다.

### 혼잡도의 한계

서울시 실시간 인구데이터는 **주요 120여 곳만** 다루고 한 번에 한 곳씩만 조회된다.
그래서 경로가 지나는 장소를 먼저 추리고(`hotspotsAlong`) 그 장소들만 병렬로 부른다.
`src/data/seoul/hotspots.ts`의 장소 목록은 **씨앗 10곳**이고, 전체 목록은 서울
열린데이터광장에서 받아 대체해야 한다. 목록에 없는 동네는 중립값으로 떨어진다.

## API 키 발급처

| 무엇 | 어디서 | 없으면 |
|---|---|---|
| **TMAP** appKey | [openapi.sk.com](https://openapi.sk.com) → 앱 등록 | 경로 자체가 mock |
| 네이버 Maps | [ncloud.com](https://www.ncloud.com) → Console → AI·NAVER API → Maps | 주소 검색만 빠짐 |
| 서울 열린데이터광장 | [data.seoul.go.kr](https://data.seoul.go.kr) → 인증키 신청 | `quiet` 중립값 |
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

### 엔드포인트 검증 상태

무효한 키로 호출해 응답을 보고 확인했다. `INVALID_API_KEY`나
`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 오면 경로는 맞고 키만 없다는 뜻이다.

| 경로 | 상태 |
|---|---|
| TMAP `POST /tmap/routes/pedestrian?version=1` | **확인** — `INVALID_API_KEY` |
| TMAP `GET /tmap/pois?version=1` | **확인** — `INVALID_API_KEY` |
| 도시공원 `apis.data.go.kr/openapi/tn_pubr_public_cty_park_info_api` | **확인** — 키 미등록 응답 |
| 건축물대장 `apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo` | **확인** — 구버전 `BldRgstService_v2`는 폐기됨 |
| 네이버 지오코딩 `maps.apigw.ntruss.com/map-geocode/v2/geocode` | **확인** — `401 Authentication information are missing` |
| 서울 실시간 인구데이터 | 경로 미확인 — 아래 참고 |
| 브이월드 건물 레이어 아이디·층수 속성명 | **미확인** — 레이어 목록에서 확인 필요 |

찾은 오류 두 가지:
- 공공데이터포털 두 API는 **모두 `apis.data.go.kr`에 있다.**
  `api.odcloud.kr`도 `api.data.go.kr`(s 없음)도 이들을 서빙하지 않는다.
- 건축물대장 `BldRgstService_v2`는 폐기됐다(`NO_OPENAPI_SERVICE_ERROR`).

### 서울 API는 HTTPS를 아예 안 받는다

`openapi.seoul.go.kr`의 443과 8088 양쪽에 TLS 핸드셰이크를 시도하면 둘 다
`Connection reset by peer`로 끊긴다. 평문 HTTP 전용이다.

iOS의 App Transport Security는 평문 HTTP를 기본 차단한다. 즉 **토스 앱 안에서 이
주소를 직접 호출하면 실패한다.** 혼잡도(`quiet`)를 쓰려면 자체 HTTPS 프록시가
선택이 아니라 필수다. 키 보호를 위해 어차피 필요했던 그 프록시다.

`src/config.ts`의 `seoul.baseUrl` 기본값은 프록시를 세우기 전까지의 자리표시자다.

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
