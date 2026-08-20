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
        displayName: '썸타임레프트',
        primaryColor: '#3F5A8A',
        /**
         * **이미지 주소**다. 번들에 넣는 파일 경로가 아니다 —
         * 프레임워크가 이 값을 그대로 `<Image source={{ uri }} />`에 넘긴다.
         * 그래서 './assets/icon.png' 같은 상대 경로는 영영 안 뜬다.
         *
         * 아이콘 그림 자체는 `assets/icon.png`에 있다(`python3 scripts/make-icon.py`).
         * 앱인토스 콘솔에 올려 주소를 받은 뒤 그 주소를 여기 넣는다.
         * 그전까지는 템플릿 기본값과 같이 비워 둔다 — 지금은 `withTitle: false`라
         * 화면에 쓰이지도 않고, 빈 값이면 프레임워크가 알아서 건너뛴다.
         */
        icon: '',
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
