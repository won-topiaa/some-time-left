/**
 * 개발 서버(granite dev)의 진입점.
 *
 * `npm create granite-app` 템플릿에는 있는데 우리 프로젝트에는 없었다.
 * 없으면 dev 서버가 이렇게 멈춘다 —
 *
 *   Error: Can't resolve './index' in '/Users/.../some-time-left'
 *
 * 그래서 샌드박스 앱이 아무것도 못 받고, 오류도 볼 수 없었다.
 *
 * `src/_app.tsx`를 import하는 것만으로 앱이 제 이름(`some-time-left`)으로
 * 등록되고, `register`가 그것을 개발용 엔트리(`shared`)로 한 번 더 등록한다.
 * 배포용 `.ait`은 `granite.config.ts`의 `entryFile`을 쓰므로 이 파일과 무관하다.
 */

import { register } from '@granite-js/react-native';
import App from './src/_app';

register(App);
