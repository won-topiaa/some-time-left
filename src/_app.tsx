import type { PropsWithChildren } from 'react';
import { AppsInToss } from '@apps-in-toss/framework';
import type { InitialProps } from '@granite-js/react-native';
import { SafeAreaProvider } from '@granite-js/native/react-native-safe-area-context';
import { context } from './require.context';
import { TripProvider } from './state/TripContext';
import { configureApi } from './config';

/**
 * 외부 API 설정 주입.
 *
 * **비밀값은 이 파일에 커밋하지 않는다.** 여기 적힌 값은 앱 번들에 그대로
 * 들어가고, 이 리포지토리에도 남는다. 주소처럼 공개돼도 되는 값만 둔다.
 *
 * 키가 필요한 항목(`tmap.appKey`, `congestionProxy.token` 등)은 로컬에서
 * 채워 넣고 커밋하지 않는다. 값이 없으면 해당 기능만 꺼지고 앱은 계속 돈다 —
 * TMAP 키가 없으면 경로가 mock으로, 프록시가 없으면 `quiet`이 중립값으로.
 */
configureApi({
  tmap: { appKey: null },
  congestionProxy: {
    // 공개 엔드포인트라 커밋해도 된다. 인증키는 이 뒤(프록시 서버)에만 있다.
    baseUrl: 'https://some-time-left-proxy.yangjuwon240.workers.dev',
    // 프록시의 PROXY_TOKEN과 같은 값. 로컬에서 채우고 커밋하지 않는다.
    token: null,
  },
  publicData: { serviceKey: null },
  vworld: { key: null },
});

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return (
    <SafeAreaProvider>
      <TripProvider>{children}</TripProvider>
    </SafeAreaProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
