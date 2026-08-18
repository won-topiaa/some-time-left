import type { PropsWithChildren } from 'react';
import { AppsInToss } from '@apps-in-toss/framework';
import type { InitialProps } from '@granite-js/react-native';
import { SafeAreaProvider } from '@granite-js/native/react-native-safe-area-context';
import { context } from './require.context';
import { TripProvider } from './state/TripContext';
import { configureApi } from './config';
import { localSecrets } from './config.local';

/**
 * 외부 API 설정 주입.
 *
 * 공개돼도 되는 값(주소)만 여기 두고, **비밀값은 전부 `config.local.ts`에 있다.**
 * 그 파일은 커밋되지 않으므로 이 파일을 건드릴 일이 없다 — `git pull` 때 충돌하지도,
 * 실수로 키를 올리지도 않는다.
 *
 * 값이 없으면 해당 기능만 꺼지고 앱은 계속 돈다.
 */
configureApi({
  tmap: { appKey: localSecrets.tmapAppKey },
  // 프록시 주소는 공개값이라 config.ts에 기본값으로 있다. 여기선 토큰만 넘긴다.
  congestionProxy: { token: localSecrets.congestionProxyToken },
  publicData: { serviceKey: localSecrets.publicDataServiceKey },
  vworld: { key: localSecrets.vworldKey },
});

function AppContainer({ children }: PropsWithChildren<InitialProps>) {
  return (
    <SafeAreaProvider>
      <TripProvider>{children}</TripProvider>
    </SafeAreaProvider>
  );
}

export default AppsInToss.registerApp(AppContainer, { context });
