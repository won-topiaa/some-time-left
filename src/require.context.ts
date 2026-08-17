// 파일 기반 라우팅을 위해 pages 디렉터리를 스캔한다. granite가 사용한다.
export const context = require.context('./pages', true, /\.(tsx|ts)$/);
