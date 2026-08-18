import type { PropsWithChildren } from 'react';
import { AppsInToss } from '@apps-in-toss/framework';
import type { InitialProps } from '@granite-js/react-native';
import { SafeAreaProvider } from '@granite-js/native/react-native-safe-area-context';
import { context } from './require.context';
import { TripProvider } from './state/TripContext';
import { configureApi } from './config';

/**
 * 외부 API 키 주입.
 *
 * 지금은 값이 비어 있어 mock 경로로 동작한다. 실제 키를 넣거나,
 * 더 나은 방법으로 `baseUrl`을 자체 서버 프록시로 바꾼다 —
 * 클라이언트 번들에 들어간 키는 그대로 노출된다.
 */
configureApi({
  tmap: { appKey: null },
  naver: { keyId: null, key: null },
});

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return (
    <SafeAreaProvider>
      <TripProvider>{children}</TripProvider>
    </SafeAreaProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
