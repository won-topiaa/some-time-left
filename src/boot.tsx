/**
 * 앱의 실제 껍데기.
 *
 * `_app.tsx`에서 떼어냈다. 진입 파일이 이걸 **지연 로딩**해야, 여기서(또는 여기가
 * 끌어오는 어떤 모듈에서) 터진 오류를 붙잡아 화면에 보여줄 수 있다.
 * 진입 파일이 직접 import하면 그 오류는 우리 코드가 한 줄도 돌기 전에 나서
 * 흰 화면만 남는다.
 */

import type { PropsWithChildren } from 'react';
import type { InitialProps } from '@granite-js/react-native';
import { SafeAreaProvider } from '@granite-js/native/react-native-safe-area-context';
import { TripProvider } from './state/TripContext';
import { configureApi } from './config';
import { localSecrets } from './config.local';

/**
 * 외부 API 설정 주입.
 *
 * 공개돼도 되는 값(주소)만 config.ts에 두고, **비밀값은 전부 `config.local.ts`에 있다.**
 * 그 파일은 커밋되지 않으므로 이 파일을 건드릴 일이 없다.
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

export function Boot({ children }: PropsWithChildren<InitialProps>) {
  return (
    <SafeAreaProvider>
      <TripProvider>{children}</TripProvider>
    </SafeAreaProvider>
  );
}
