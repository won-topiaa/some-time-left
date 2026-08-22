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

/**
 * **SafeAreaProvider를 여기서 또 감싸지 않는다.**
 *
 * `AppRoot`가 이미 Router 위에서 하나 감싸고 있어서, 여기서 하나 더 두면 두 겹이 된다.
 * 안쪽 provider는 자기 크기를 재서 setState하고, 그 결과가 자기 레이아웃을 바꾸고,
 * 다시 재고… 실기기에서 이게 그대로 무한 루프가 됐다 —
 *
 *   ERROR  Maximum update depth exceeded. This can happen when a component
 *          calls setState inside useEffect ...
 *
 * 화면마다 초당 수십 줄씩 찍히고 앱이 버벅였다. 값도 틀린다: `useSafeAreaInsets()`가
 * 바깥 화면이 아니라 안쪽 provider의 틀을 기준으로 답한다.
 *
 * safe-area-context는 **앱 하나에 provider 하나**를 전제로 만들어져 있다.
 * 우리는 프레임워크가 준 것을 그대로 쓴다.
 */
export function Boot({ children }: PropsWithChildren<InitialProps>) {
  return <TripProvider>{children}</TripProvider>;
}
