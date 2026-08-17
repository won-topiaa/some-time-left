/**
 * 파일 기반 라우팅의 경로 타입.
 * granite dev/build가 생성해 주기도 하지만, 타입체크가 빌드에 의존하지 않도록
 * 경로 목록을 직접 선언해 둔다. pages 아래 파일을 추가하면 여기도 같이 늘린다.
 */
declare module '@granite-js/react-native' {
  interface RegisterScreenInput {
    '/': undefined;
    '/mood': undefined;
    '/route': undefined;
    '/walk': undefined;
    '/arrive': undefined;
  }
}

export {};
