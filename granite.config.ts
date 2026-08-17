import { defineConfig } from '@granite-js/react-native/config';
import { appsInToss } from '@apps-in-toss/framework/plugins';

export default defineConfig({
  appName: 'some-time-left',
  scheme: 'some-time-left',
  entryFile: 'src/_app.tsx',
  plugins: [
    appsInToss({
      brand: {
        displayName: '썸타임레프트',
        primaryColor: '#3F5A8A',
        icon: './assets/icon.png',
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
