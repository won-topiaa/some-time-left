# 출시 절차 — 앱인토스 콘솔 등록과 배포

이 문서는 **실측한 것과 확인하지 못한 것을 나눠서** 적는다.
명령어와 그 동작은 저장소에 설치된 `@apps-in-toss/react-native-cli` 2.10.10을
직접 읽고 돌려서 확인했다. 콘솔 화면은 볼 수 없어서, 거기서 해야 하는 일은
"무엇이 필요한지"까지만 적고 화면 순서는 지어내지 않는다.

## 한눈에

```
콘솔에서 미니앱 만들기 → API 키 받기 →  ait token add  →  npm run deploy
        (사람이 하는 일)                      (한 번)         (그 뒤로는 이것만)
```

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

**둘, 배포용 API 키.** `ait deploy`가 쓰는 키다. 콘솔의 어느 메뉴에서 발급되는지는
직접 보지 못해 적지 않는다 — 콘솔에서 "API 키" 또는 "배포 키"를 찾으면 된다.

> 심사·검수 절차가 있는지, 있다면 무엇을 요구하는지는 확인하지 못했다.
> 아래 배포는 `intoss-private` 스킴으로 **내 토스에서만 열리는 배포**라
> 심사와 무관하게 지금 바로 할 수 있다.

## 2. 키를 등록한다 — 한 번만

```bash
ait token add
```

`--api-key` 없이 그냥 치면 **가려진 입력**으로 물어본다. 화면에도 명령 기록에도
키가 남지 않는다. 이 저장소의 다른 키들과 같은 규칙이다 — 키는 대화나 기록에
붙여넣지 않는다.

키는 `~/.ait/credentials`에 프로필 이름별 JSON으로 **평문 저장**된다.
저장소 밖이라 커밋될 일은 없지만, 공용 컴퓨터라면 알고 있어야 한다.
지울 때는 `ait token remove`.

프로필을 나누고 싶으면 이름을 준다: `ait token add dev` → `npm run deploy -- --profile dev`.
아무것도 안 주면 `default`.

> **주의.** 키를 고르는 순서가 `저장된 프로필 → --api-key`다.
> 즉 프로필에 옛날 키가 남아 있으면 `--api-key`로 새 키를 줘도 **조용히 무시된다.**
> 키를 바꿀 때는 `ait token remove` 먼저.

## 3. 배포한다

```bash
npm run deploy
```

`predeploy`가 `ait build`를 먼저 돌린다. `ait deploy`는 **빌드를 하지 않고**
이미 만들어진 `.ait` 파일을 올리기만 하기 때문이다. 둘을 묶어 두지 않으면
소스를 고쳐도 지난번 번들이 그대로 올라간다.

빌드가 만드는 것:

```
some-time-left.ait      3.3MB — RN 0.84.0 / 0.72.6 각각의 iOS·Android 번들과 소스맵
```

(`.gitignore`에 있다. 빌드할 때마다 새로 나오는 것이라 커밋하지 않는다.)

성공하면 마지막에 이 줄이 나온다.

```
intoss-private://some-time-left?_deploymentId=01a01dd5-...
```

**이 주소를 내 폰의 토스에서 열면 방금 올린 앱이 뜬다.** 이것이 실기기 확인이다.

쓸 만한 옵션 몇 가지:

| 옵션 | 하는 일 |
|---|---|
| `-m "메모"` | 배포에 메모를 남긴다 (최대 1000자) |
| `--profile dev` | 다른 프로필의 키로 배포 |
| `--scheme-only` | 위 `intoss-private://` 한 줄만 출력 (스크립트에서 쓰기 좋다) |
| `--timeout 200` | 배포 상태 확인 대기 시간(초). 기본 100, 최대 300 |

`npm run`으로 넘길 때는 `--`를 하나 더 붙인다: `npm run deploy -- -m "첫 배포"`.

## 4. 배포 전에 보는 것

```bash
npm test          # 308개
npm run typecheck
npm run check-config   # 키가 실제로 응답하는지 — 아이콘 주소 포함
```

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
  brandDisplayName: "썸타임레프트",
  brandPrimaryColor: "#3F5A8A",
  brandIcon: "https://.../icon.png",
  navigationBar: { withBackButton: true, withTitle: false, transparentBackground: true }
}
```

`.ait` 안의 `app.json`에는 `appName`·`permissions`·`appType`만 들어간다.
위치 권한이 콘솔에 알려지는 경로가 이것이다.

## 확인하지 못한 것

정직하게 남겨 둔다.

- 콘솔 화면의 실제 메뉴 구조와 미니앱 생성 절차
- API 키가 발급되는 정확한 위치
- 공개(심사) 절차의 존재 여부와 요구 사항
- `intoss-private` 배포와 공개 배포가 콘솔에서 어떻게 구분되는지

이 넷은 콘솔에 들어가 봐야 알 수 있다. 화면을 보고 막히는 지점을 알려주면
그 지점부터 다시 맞춰 볼 수 있다.
