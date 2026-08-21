import { defineConfig } from '@granite-js/react-native/config';
import { appsInToss } from '@apps-in-toss/framework/plugins';

export default defineConfig({
  appName: 'some-time-left',
  /**
   * 앱인토스 미니앱의 스킴은 우리 앱 이름이 아니라 `intoss`다.
   * 딥링크가 이 값으로 만들어지므로 우리 이름을 넣으면 토스 안에서 열리지 않는다.
   * (@apps-in-toss/react-native-cli의 프로젝트 템플릿과 마이그레이션 코드모드가
   *  모두 이 값을 넣는다 — 실측 확인)
   */
  scheme: 'intoss',
  entryFile: 'src/_app.tsx',
  plugins: [
    appsInToss({
      appType: 'general',
      /*
       * `target`을 적지 않는다.
       *
       * ait build는 런타임 두 벌(0.84.0 · 0.72.6)을 만드는데, 0.72.6 쪽만
       * CLI가 임시 설정에 target을 주입하고 0.84.0 쪽은 **이 파일을 그대로** 쓴다
       * (RUNTIME_BUILD_DEFINITIONS의 configTargetVersion 유무).
       * 그래서 여기에 '0.72.6'을 적어 두면 0.84.0 번들까지 0.72 호환 변환을 받아
       * 두 번들이 바이트까지 같아진다 — 실제로 그랬다. 런타임을 나눠 만드는
       * 의미가 사라지므로 비워 둔다.
       *
       * (한때 이게 흰 화면의 원인이라고 적어 뒀지만 아니었다. 진짜 원인은
       *  `pages/_404.tsx`가 없어서 라우터가 첫 렌더에서 던진 것이다.
       *  docs/release.md의 '흰 화면' 항목에 남겨 뒀다.)
       *
       * 비워 두면 플러그인 기본값 0.84.0이 쓰인다(REACT_NATIVE_VERSION).
       * package.json의 react-native도 0.84.0으로 맞춰 둔다 — 개발 서버는
       * 그 버전의 JS를 번들에 그대로 넣기 때문에 어긋나면 샌드박스가 죽는다.
       */
      brand: {
        /**
         * 토스 앱 목록과 앱 안에서 함께 보이는 이름이라
         * 앱인토스 콘솔의 '한국어 앱 이름'과 **같아야 한다**.
         * 저장소·appName·영어 이름은 `some-time-left` / `Some Time Left` 그대로다.
         */
        displayName: '자투리 시간',
        primaryColor: '#3F5A8A',
        /**
         * **이미지 주소**다. 번들에 넣는 파일 경로가 아니다 —
         * 프레임워크가 이 값을 그대로 `<Image source={{ uri }} />`에 넘긴다.
         * 그래서 './assets/icon.png' 같은 상대 경로는 영영 안 뜬다.
         *
         * 원본 그림은 `assets/icon.png`에 있고(`python3 scripts/make-icon.py`),
         * 같은 스크립트가 프록시에 심을 base64도 함께 만든다. 프록시가 이미 떠 있으니
         * 거기서 함께 내보낸다 — 아이콘 하나 때문에 호스팅을 따로 두지 않는다.
         *
         * 앱인토스 콘솔이 아이콘 호스팅을 제공하면 그 주소로 바꿔도 된다.
         * 그때는 `proxy/src/handler.ts`의 `/icon.png` 경로를 지워도 그만이다.
         */
        icon: 'https://some-time-left-proxy.yangjuwon240.workers.dev/icon.png',
      },
      // 위치만 받는다. 연락처는 "약속 상대" 기능에도 쓰지 않는다 —
      // 이름을 직접 적게 하는 편이 권한 요구보다 가볍고 덜 불쾌하다.
      permissions: [{ name: 'geolocation', access: 'access' }],
      navigationBar: {
        withBackButton: true,
        withTitle: false,
        transparentBackground: true,
      },
    }),
  ],
});
