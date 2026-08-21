# 출시 절차 — 앱인토스 콘솔 등록과 배포

이 문서는 **실측한 것과 확인하지 못한 것을 나눠서** 적는다.
명령어와 그 동작은 저장소에 설치된 `@apps-in-toss/react-native-cli` 2.10.10을
직접 읽고 돌려서 확인했다. 콘솔 화면은 볼 수 없어서, 거기서 해야 하는 일은
"무엇이 필요한지"까지만 적고 화면 순서는 지어내지 않는다.

## 먼저 — 어디서 치는가

아래 명령은 **전부 저장소 폴더 안에서** 친다. 홈 디렉터리에서 치면
`package.json`을 못 찾고 전부 ENOENT로 떨어진다.

```bash
cd ~/some-time-left
```

`ait`은 전역 명령이 아니다. 이 프로젝트의 `node_modules/.bin`에만 있으므로
**`npx ait`**으로 부른다(`ait token add`는 `zsh: command not found: ait`이 된다).
`npm run ...`은 npm이 알아서 그 경로를 잡아 주므로 그대로 쓰면 된다.

> 이 문서의 명령 블록에는 `#` 주석을 달지 않는다. macOS 기본 zsh는
> `interactive_comments`가 꺼져 있어서 `npx ait token add  # 설명`을 붙여넣으면
> 설명이 **인자로 넘어가** `Unknown Syntax Error`가 난다. 설명은 블록 밖에 적는다.

## 한눈에

```
콘솔에서 미니앱 만들기 → API 키 받기 → ait token add → npm run deploy → 폰에서 테스트 → 검토 요청
      (사람이 하는 일)      (키 메뉴)      (한 번)       (그 뒤로는 이것만)   (최소 1번 필수)
```

**테스트를 한 번도 안 하면 검토를 요청할 수 없다.** 공식 문서에 못 박혀 있다 —
"테스트를 최소 1번 이상 완료해야 검토를 요청할 수 있어요."

## 1. 콘솔에서 미니앱 만들기 — 여기서만 사람이 필요하다

콘솔 주소는 CLI가 배포 요청을 보내는 곳과 같다.

```
https://apps-in-toss.toss.im/console
```

(CLI의 `DEFAULT_API_BASE_URL` 값이다. 배포는 이 주소의
`/api-public/v3/openapi/bundles/<appName>/upload-start`로 올라간다.)

여기서 두 가지를 얻어야 한다.

**하나, 미니앱 등록.** 등록할 때 정하는 앱 이름은 반드시
`granite.config.ts`의 `appName`과 **같아야 한다.**

```ts
appName: 'some-time-left',
```

업로드 주소에 이 이름이 그대로 들어가기 때문이다. 다르면 배포가 404로 떨어지고,
그 오류만 봐서는 이름이 어긋난 줄 알기 어렵다. 콘솔에서 다른 이름으로
만들었다면 `granite.config.ts`를 그 이름으로 고치고 다시 빌드하면 된다.

**둘, 배포용 API 키.** `ait deploy`가 쓰는 키다.

```
워크스페이스 선택 → 왼쪽 메뉴 '키'
```

전체 앱 단위로도, 특정 앱 단위로도 권한을 줄 수 있다.

> 아래 배포는 `intoss-private` 스킴으로 **내 토스에서만 열리는 배포**라
> 검토와 무관하게 지금 바로 할 수 있다. 오히려 이 테스트를 최소 한 번 해야
> 검토를 요청할 수 있다.

## 1-1. 기본 정보 (콘솔 1단계)

화면을 보고 채운 값이다. 글자 수 제한은 화면에 표시된 것 그대로.

### appName — 고를 것이 없다

```
some-time-left
```

`granite.config.ts`의 `appName`과 **반드시 같아야 한다.** 배포가
`/api-public/v3/openapi/bundles/<appName>/upload-start`로 올라가기 때문에,
어긋나면 배포가 404로 떨어지고 그 오류만으로는 원인을 알기 어렵다.

### 한국어 앱 이름 (10자)

```
자투리 시간
```

`granite.config.ts`의 `brand.displayName`과 같은 값이다(둘 다 사용자가 본다).
이름을 바꾸려면 두 곳을 함께 고쳐야 한다.

저장소 이름·`appName`·영어 이름은 `some-time-left` / `Some Time Left` 그대로다.
`appName`은 배포 주소에 들어가므로 절대 따라 바꾸지 않는다.

### 영어 앱 이름 (15자)

```
Some Time Left
```

14자로 딱 들어간다.

### 부제 (20자) — "사용자가 얻는 가치"

```
약속 5분 전에 도착하는 길
```

15자. 이 앱의 값은 "길 찾기"가 아니라 **5분 전**이라는 지점 하나다.
(`ARRIVE_EARLY_SEC`를 바꾸면 이 문안과 스크린샷도 함께 고쳐야 한다.)
빨리 가는 것도, 오래 걷는 것도 아니라는 걸 부제에서 이미 말한다.

### 상세 설명 (450자) — "무엇을 보고, 어떤 버튼을 누르고, 무엇을 경험하는지"

```
약속보다 일찍 도착해 애매하게 남는 시간을 걷기로 채워주는 앱이에요.

첫 화면에서 약속 장소와 시각을 입력해요. 20분이면 닿는 곳에 30분이 남았다면, 남는 10분을 걸을 길을 만들어요.

다음 화면에서 지금 기분을 골라요. '설레요', '긴장돼요', '생각이 많아요', '지쳤어요', '그냥 그래요', '햇볕이 싫어요' 여섯이에요. 경사나 그늘은 고르지 않아요. 기분만 고르면 앱이 정해요.

경로 화면에서 추천된 길과 "이 시간엔 그늘이 이어지는 길이에요" 같은 이유 한 줄을 봐요. '이 길로 갈게요'를 누르면 걷기가 시작되고, 남은 거리와 "조금 천천히 걸어도 돼요" 같은 페이스 안내를 봐요.

도착하면 "걸으면서 무슨 생각 했어요?"에 한 줄을 남길 수 있어요. '지나온 길'에는 걸어온 길의 모양이 쌓여요.

위치는 길을 만들고 남은 거리를 셀 때만 써요. 기록은 기기 안에만 남아요.
```

448자. 안에 인용된 문장은 지어낸 것이 아니라 화면에 실제로 있는 문구다
(`src/pages/`, `src/domain/copy.ts`).

마지막 줄도 코드와 맞춰 썼다. 좌표가 나가는 곳은 `src/data/tmap/`의
경로·검색 요청뿐이고, 혼잡도 프록시에는 좌표가 아니라 장소 이름만 간다
(`congestion.ts`의 `area` 파라미터). 기록은 앱인토스 Storage — 기기 안에만 남는다.

### 사용 연령

연령 제한이 필요한 요소가 없다. 가장 낮은 등급(전체 이용가)을 고른다.

### 이메일 주소

본인이 실제로 확인하는 주소. 저장소에는 적지 않는다.


## 1-2. 카테고리 및 노출 (콘솔 2단계)

### 앱 로고 (600x600) / 다크모드 앱 로고 (600x600)

```
assets/logo-600.png
assets/logo-600-dark.png
```

`python3 scripts/make-icon.py`가 `assets/icon.png`(brand.icon 원본)와 함께 만든다.
다크모드는 색을 새로 고른 게 아니라 명도만 올렸다 — 밝은 종이빛 정사각형을
어두운 목록에 얹으면 로고가 아니라 조명처럼 보이고, 남색 #3F5A8A는
그 위에서 거의 안 보이기 때문이다.

### 스크린샷

```
assets/store/01-home.png     636x1048   20분 거리에 30분이 남았을 때
assets/store/02-mood.png     636x1048   고를 건 기분 하나
assets/store/03-route.png    636x1048   왜 이 길인지 말해줘요
assets/store/04-walk.png     636x1048   빠르면 천천히, 늦으면 조금 빠르게
assets/store/05-arrive.png   636x1048   남은 5분은 기록의 시간
assets/store/06-trace.png    636x1048   걸은 길이 모양으로 쌓여요
assets/store/07-wide.png     1504x741   약속 5분 전에 도착하는 길 (가로 1장)
```

세로 최소 3장·가로 최소 1장이 기준인데 세로를 여섯 장 다 낸다. 이 앱은
화면 하나가 아니라 **순서**가 제품이라(고르고 → 받고 → 걷고 → 남기고 → 쌓인다)
셋만 고르면 어느 하나가 빠진다.

`npm run store-shots`로 다시 만든다. 손으로 그린 그림이 아니라
`src/ui/theme.ts`·`src/domain/copy.ts`·`src/domain/mood.ts`를 **그대로 import** 해서
그린다 — 스토어 이미지가 앱과 어긋나는 건 대개 토큰을 손으로 옮겨 적어서 생긴다.
화면에 보이는 문구는 전부 앱에 실제로 있는 문구다.

> playwright는 이 저장소의 의존성이 아니다(스토어 이미지 만들 때만 쓰는 도구를
> 앱 설치하는 사람 모두가 내려받을 이유가 없다). 없으면 HTML만 나오고,
> `npm i -D playwright` 뒤에 다시 돌리면 PNG까지 나온다.

크기가 맞는지는 배포 전 점검이 같이 본다 — 1px만 달라도 콘솔이 되돌려 보낸다.

```bash
npm run check-config
```

### 앱 검색 키워드

```
자투리시간, 산책, 걷기, 산책코스, 약속, 시간때우기, 여유시간, 걷기좋은길, 그늘길, 산책길
```

"길찾기"나 "지도"는 넣지 않는다. 그 말로 들어온 사람이 기대하는 건 최단 경로인데
이 앱은 일부러 돌아가는 길을 주므로, 검색으로 데려오면 서로 손해다.

### 카테고리

콘솔의 선택지 목록은 보지 못했다. 이 앱이 놓일 자리는 걷기·산책 쪽이라
**건강/운동**이나 **라이프스타일** 계열이 맞고, 지도·내비게이션 계열은 아니다
(최단 경로를 주는 앱이 아니다). 목록을 보여주면 그 안에서 골라 줄 수 있다.


## 2. 키를 등록한다 — 한 번만

```bash
npx ait token add
```

`--api-key` 없이 그냥 치면 **가려진 입력**으로 물어본다. 화면에도 명령 기록에도
키가 남지 않는다. 이 저장소의 다른 키들과 같은 규칙이다 — 키는 대화나 기록에
붙여넣지 않는다.

키는 `~/.ait/credentials`에 프로필 이름별 JSON으로 **평문 저장**된다.
저장소 밖이라 커밋될 일은 없지만, 공용 컴퓨터라면 알고 있어야 한다.
지울 때는 `npx ait token remove`.

프로필을 나누고 싶으면 이름을 준다: `npx ait token add dev` → `npm run deploy -- --profile dev`.
아무것도 안 주면 `default`.

> **주의.** 키를 고르는 순서가 `저장된 프로필 → --api-key`다.
> 즉 프로필에 옛날 키가 남아 있으면 `--api-key`로 새 키를 줘도 **조용히 무시된다.**
> 키를 바꿀 때는 `npx ait token remove` 먼저.

## 3. 배포한다

```bash
npm run deploy
```

`predeploy`가 `npm run build`(= `ait build`)를 먼저 돌린다. `ait deploy`는
**빌드를 하지 않고** 이미 만들어진 `.ait` 파일을 올리기만 하기 때문이다.
둘을 묶어 두지 않으면 소스를 고쳐도 지난번 번들이 그대로 올라간다.

빌드가 만드는 것:

```
some-time-left.ait   파일 3.3MB / 압축 해제 14.9MB   (한도: 압축 해제 100MB)
                     RN 0.84.0 · 0.72.6 각각의 iOS·Android 번들과 소스맵
```

한도의 15%다. 소스맵이 그중 9.5MB(64%)를 차지하는데, 지금은 줄일 이유가 없다 —
용량이 문제가 되는 날은 이미지·사운드를 번들에 넣기 시작할 때이고, 그때는
번들이 아니라 프록시나 CDN에서 내려받게 하는 것이 문서의 권고이자 맞는 길이다.

(`.gitignore`에 있다. 빌드할 때마다 새로 나오는 것이라 커밋하지 않는다.)

성공하면 마지막에 이 줄이 나온다.

```
intoss-private://some-time-left?_deploymentId=01a01dd5-...
```

**이 주소를 내 폰의 토스에서 열면 방금 올린 앱이 뜬다.** 이것이 실기기 확인이다.
콘솔에서 '테스트하기'를 누르면 같은 것을 QR로도 준다.

QR로 열려면 세 가지를 다 만족해야 한다.

- 토스 앱에 로그인돼 있을 것
- 그 워크스페이스의 멤버일 것
- 만 19세 이상일 것

`intoss://`(슬래시 두 개, private 없음)는 **정식 출시 뒤에만** 열린다.
출시 전 테스트는 반드시 `intoss-private://` 쪽이다.

하위 경로나 쿼리를 붙여서 특정 화면부터 열어 볼 수도 있다.

```
intoss-private://some-time-left/trace?_deploymentId=<id>
```

`_deploymentId`는 선택이 아니라 **필수**다. 배포할 때마다 새로 발급되므로,
어제 쓰던 링크로 오늘 올린 것을 확인할 수는 없다.

쓸 만한 옵션 몇 가지:

| 옵션 | 하는 일 |
|---|---|
| `-m "메모"` | 배포에 메모를 남긴다 (최대 1000자) |
| `--profile dev` | 다른 프로필의 키로 배포 |
| `--scheme-only` | 위 `intoss-private://` 한 줄만 출력 (스크립트에서 쓰기 좋다) |
| `--timeout 200` | 배포 상태 확인 대기 시간(초). 기본 100, 최대 300 |

`npm run`으로 넘길 때는 `--`를 하나 더 붙인다: `npm run deploy -- -m "첫 배포"`.

## 폰에서 테스트하기

가장 쉬운 길은 **콘솔의 QR**이다. 폰에 주소를 옮겨 적을 일이 없다.

```
콘솔 → 앱 번들 → 테스트하기 → QR 스캔
```

세 가지를 다 만족해야 열린다. 하나라도 아니면 QR이 안 먹는다.

- 토스 앱에 로그인돼 있을 것
- 그 워크스페이스의 멤버일 것
- 만 19세 이상일 것

터미널에서 배포했다면 마지막 줄의 주소를 써도 된다. 카카오톡 '나에게 보내기'로
옮겨서 누르는 게 제일 빠르다.

```
intoss-private://some-time-left?_deploymentId=01a01e5a-bf94-7adf-9ab1-95f8c03be454
```

`_deploymentId`는 배포할 때마다 새로 발급된다. **어제 링크로 오늘 올린 것을
확인할 수는 없다** — 고쳤는데 그대로인 것 같으면 대개 이것이다.

### 이 앱을 다 보려면

화면 여섯 개를 한 바퀴 도는 가장 짧은 길.

1. **위치 권한을 허용한다.** 거절하면 경로를 만들 수 없어 2번에서 막힌다.
2. **약속 시각을 지금부터 40분쯤 뒤로 적는다.** 여유가 없으면 앱이 "그냥 곧장
   가요"로 물러서는 게 맞는 동작이라, 돌아가는 길을 보려면 여유를 줘야 한다.
   목적지는 걸어서 15~20분 거리로.
3. 기분을 고르면 경로 화면. **"왜 이 길인지" 한 줄**이 이 앱의 핵심이다.
4. 걷기 화면은 실제로 움직여야 남은 거리가 줄어든다. 집 안에서 보고 있다면
   맨 아래 **'이미 도착했어요'**를 누르면 도착 화면으로 넘어간다.
5. 도착 화면에서 한 줄을 남기거나 그냥 닫는다. **어느 쪽이든 기록은 남는다** —
   걸은 건 일어난 일이라 버튼을 눌러야 인정되는 게 아니다.
6. 첫 화면 맨 아래 **'지나온 길'**에 방금 걸은 길의 모양이 색을 갖고 들어와 있다.

## 샌드박스 앱 — 개발 중에는 이쪽이다

토스 앱에 배포해서 여는 것은 **최종 확인**이고, 개발 중 디버깅은 샌드박스 앱으로 한다.
출시 전 샌드박스에서 기능 검증을 완료하는 것이 공식 요구사항이기도 하다.

**설치** (iOS 16 이상)

```
앱스토어 → "앱인토스 샌드박스"   (id6745618667)
```

**앱까지 들어가기**

1. **개발자 로그인** — 콘솔에서 쓰는 **토스 비즈니스 계정**으로.
   공용 계정은 로그인 실패나 잦은 세션 종료가 생기니 개인 계정을 쓴다.
2. **앱 선택** — 소속 워크스페이스의 앱 목록에서 `some-time-left`.
3. **토스 인증** — 콘솔에 등록한 토스 계정으로 본인 인증. 그 계정의 토스앱이 깔린
   폰에서 푸시를 열어 완료한다.
4. **스킴 입력** — `intoss://some-time-left` → '스키마 열기'.

**로컬 서버에 붙이기** (실기기는 맥과 **같은 와이파이**)

```bash
ipconfig getifaddr en0
npm run dev
```

샌드박스 앱에서 '로컬 네트워크' 권한을 허용하고, 서버 주소 칸에 위 IP를 넣고 저장한다.
상단에 `Bundling 12%...`가 뜨면 붙은 것이다.

붙고 나면 이게 된다 — 지금까지 없던 것들이다.

- 터미널에 **실제 오류와 스택**이 찍힌다
- `j` — React Native Debugger (Console·Network·중단점)
- `d` — Dev Menu, `r` — 새로고침

그리고 **샌드박스는 토스 앱 버전 게이트를 건너뛴다.**

```js
if (operationalEnvironment === "sandbox") return true;
```

**샌드박스에서만 되는 것 / 안 되는 것**

- 샌드박스는 http를 허용한다(ATS 우회). 라이브는 https만이므로, http로 만든
  기능은 샌드박스에서만 돈다 — 우리는 전부 https라 해당 없다.
- 분석·공유 리워드·인앱 광고는 샌드박스에서 테스트할 수 없다. 우리는 안 쓴다.

### 흰 화면 — 우리 경우엔 `_404` 화면이 없어서였다

에러도 로그도 없이 새하얀 화면에 "잠시 문제가 생겼어요"만 나왔다.
그 문구는 우리 번들에 없다(토스가 네이티브에서 그린다). 원인은 이것이었다.

```tsx
// @granite-js/react-native — router/utils/screen.tsx
const notFoundPage = routeScreens.find((screen) => screen.path === '/_404');

if (notFoundPage == null) {
  throw new Error('404 page not found. Please create a `_404.ts` or `_404.tsx` file ...');
}
```

`pages/_404.tsx`가 없으면 라우터는 **매번, 첫 렌더에서** 던진다.
그리고 그 자리는 우리 오류 화면보다 위다 —

```tsx
// AppRoot.tsx — Router가 우리 컨테이너를 인자로 받는다
<Router context={context} container={Container} ... />
```

`_app.tsx`의 ErrorBoundary는 `Container` 안에 있으므로 **Router보다 아래**다.
Router가 자기 렌더 중에 던지면 우리 컨테이너는 마운트조차 안 되고,
그래서 "시작하지 못했어요" 화면도 안 뜬다. 남는 건 흰 화면뿐이다.

**화면을 하나도 안 만들어도 `pages/_404.tsx`만은 있어야 한다.**
`src/__tests__/pages.test.ts`가 이걸 지킨다 — 실기기에 올려 보기 전에는
알 수 없는 종류의 실패라 테스트로 막아 뒀다.

#### 그래도 앱 버전은 확인할 값이다

`_404`를 고친 뒤에도 흰 화면이면 토스 앱 버전을 본다.
프레임워크가 기준 미만이면 우리 앱을 아예 그리지 않는다.

```js
// @apps-in-toss/framework — AppsInTossContainer
if (!isMinVersionSupported({ android: "5.220.0", ios: "5.221.0" })) {
  return <><AppEvent.System /><AppUpdate /></>;   // Container를 건너뛴다
}

function AppUpdate() {
  useEffect(() => { openURL(`supertoss://closePage?url=${UPDATE_SCHEME}`); }, []);
  return <></>;                                    // 아무것도 그리지 않는다
}
```

업데이트 안내 스킴을 띄우려 시도하지만, 그게 안 먹으면 역시 흰 화면이다.
**최소 버전: Android 5.220.0 / iOS 5.221.0.** 샌드박스는 이 게이트를 건너뛴다.

#### 다음엔 이 순서로

흰 화면을 target·React 버전·번들 구조로 반나절 쫓았지만 전부 헛다리였다.
번들을 뜯기 전에 **샌드박스로 붙어 오류를 먼저 본다.** 오류 한 줄이 그 반나절보다 빠르다.

### `'PlatformConstants' could not be found` — RN 버전을 맞춰야 한다

샌드박스에서 이 오류가 뜬다.

```
Requiring module "node_modules/react-native/Libraries/Utilities/Platform.ios.js",
which threw an exception: Invariant Violation: TurboModuleRegistry.getEnforcing(...):
'PlatformConstants' could not be found.
```

DevTools 제목줄에 `React Native: 0.84.0`이 찍혀 있다 — **네이티브는 0.84 브리지리스**인데
우리가 보낸 번들은 `react-native@0.72.6`의 JS였다. 0.72의 `Platform.ios.js`가
0.84 바이너리에 없는 방식으로 모듈을 찾으니 그 자리에서 멈춘다.

`package.json`의 `react-native`·`react`는 **CLI가 정한 값에 고정**한다.
`@apps-in-toss/react-native-cli`의 마이그레이션 표에 그대로 적혀 있다.

| 패키지 | 값 |
|---|---|
| `react-native` | `0.84.0` |
| `react` | `19.2.3` |
| `@types/react` | `19.2.3` |

`@granite-js/*`는 같은 표의 `1.0.18`이 아니라 **`^1.0.42`를 유지한다.** 1.0.18에는
`useKeyboardHeight`가 없어서 `src/pages/index.tsx`와 `arrive.tsx`가 컴파일되지 않는다.
표는 최소선이지 상한이 아니다.

**개발과 배포에서 react-native가 오는 곳이 다르다.** 이 차이를 모르면 엉뚱한 데를 판다.

| | react-native JS | 확인 방법 |
|---|---|---|
| `granite dev` (샌드박스) | **번들에 들어간다** | 개발 번들에 `getEnforcing('PlatformConstants')`가 있다 |
| `ait build` (배포) | 호스트가 준다 | 배포 번들에 `__SHARED__["react-native"]`만 있다 |

그래서 이 고침이 없애는 건 **샌드박스 오류뿐이다.** 이 고침 전후로 배포 번들은
바이트 크기까지 같았다(1375385) — 배포본 흰 화면은 위의 `_404`가 원인이었다.
두 오류는 별개이고, `_404`가 뒤에 숨어 있었을 뿐이다.

### 안 보이면 여기부터

| 증상 | 원인 |
|---|---|
| **아무것도 없는 흰 화면** | `pages/_404.tsx`가 없거나 토스 앱 버전이 낮다. 위 참고 |
| 샌드박스에 `PlatformConstants` 오류 | `react-native`가 0.84.0이 아니다. 위 참고 |
| 첫 줄에 날씨가 없다 | 위치 거절이거나 네트워크. 날씨는 없으면 그 줄을 안 그린다 |
| 아이콘이 안 뜬다 | 프록시 재배포 (`cd proxy && npm run deploy`) |
| 고친 게 그대로다 | 옛 `_deploymentId`로 열었다. 새로 배포한 주소로 |
| 경로가 이상하게 짧다 | 약속까지 여유가 없어 최단 경로로 물러선 것. 정상이다 |


## 4. 배포 전에 보는 것

```bash
npm test
npm run typecheck
npm run check-config
```

날씨(Open-Meteo)는 키가 없어서 건너뛸 조건이 없다 — 늘 실제로 불러 본다.
기상청 초단기예보를 쓰다 옮겨 왔다. 기상청은 서비스마다 활용신청을 따로 받아서,
공원이 승인돼도 날씨는 다시 신청하고 승인을 기다려야 했다. 첫 화면 한 줄이
그만한 절차를 요구하면 그건 기능이 비싼 것이다.

`check-config`는 값이 들어갔는지만 보지 않고 **실제로 불러본다.** 아이콘 주소가
404거나 이미지가 아니면 여기서 걸린다. 배포하고 나서 아이콘이 안 뜨는 것을
발견하는 것보다 낫다.

## 아이콘을 바꿀 때 — 무엇을 다시 배포해야 하나

`brand.icon`은 **주소**이고, 그 주소를 프록시가 서빙한다. 그래서 둘이 나뉜다.

- **그림만 바꿀 때** (`scripts/make-icon.py` 수정)
  → `python3 scripts/make-icon.py && cd proxy && npm run deploy`
  앱은 다시 배포하지 않아도 된다. 주소는 그대로고 그 주소가 주는 그림만 바뀐다.

- **주소를 바꿀 때** (콘솔이 아이콘 호스팅을 제공한다든지)
  → `granite.config.ts`를 고치고 `npm run deploy`
  주소 문자열은 번들에 박히기 때문에 앱을 다시 빌드해야 한다.

실제 아티팩트를 열어서 확인한 내용이다. 브랜드 값들은 `app.json`이 아니라
번들 안에 들어간다:

```js
_.__appsInToss = {
  appType: "general",
  deploymentId: "...",
  brandDisplayName: "자투리 시간",
  brandPrimaryColor: "#3F5A8A",
  brandIcon: "https://.../icon.png",
  navigationBar: { withBackButton: true, withTitle: false, transparentBackground: true }
}
```

`.ait` 안의 `app.json`에는 `appName`·`permissions`·`appType`만 들어간다.
위치 권한이 콘솔에 알려지는 경로가 이것이다.

## 공식 문서와 설치된 CLI가 다른 곳

문서의 명령어 표는 이렇게 적혀 있는데, 설치된 CLI(2.10.10)에서는 **둘 다 에러가 난다.**
그대로 따라 하면 막히므로 적어 둔다.

| 문서 | 실제 |
|---|---|
| `ait token add [워크스페이스명] [API 키]` | `npx ait token add [--api-key <키>] [프로필]` |
| `ait deploy [워크스페이스명] [API 키]` | `npx ait deploy [--api-key <키>] [--profile <프로필>]` |

```
$ npx ait token add myworkspace MYKEY
Unknown Syntax Error: Command not found; did you mean one of:
  0. ait token add [--api-key #0] [profile]

$ npx ait deploy myworkspace MYKEY
Unknown Syntax Error: Extraneous positional argument ("myworkspace").
```

`ait deploy`는 위치 인자를 아예 받지 않는다. `--workspace`는 남아 있지만
deprecated이고, CLI가 직접 "이 옵션 대신 --profile을 사용해주세요"라고 말한다.

## 확인하지 못한 것

정직하게 남겨 둔다.

- 카테고리 선택지 목록
- 검토에 걸리는 시간과 반려됐을 때의 재제출 조건
- 검토 **중인** 버전을 회수하거나 고칠 수 있는지
- 승인 후 스크린샷·설명만 바꿀 때 재검토가 걸리는지

콘솔 화면을 보고 막히는 지점을 알려주면 그 지점부터 다시 맞춰 볼 수 있다.
