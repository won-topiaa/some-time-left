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
      // package.json의 react-native과 같은 값으로 못 박는다. 둘이 어긋나면
      // 빌드는 통과하고 기기에서만 깨지는 종류의 문제가 된다.
      target: '0.72.6',
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
