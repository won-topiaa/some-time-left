import { defineConfig } from 'vitest/config';
// 도메인과 데이터 파싱 계층을 테스트한다. React Native나 네트워크에 의존하지 않는
// 순수 로직이라 네이티브 런타임 없이 CI에서 그대로 돌아간다.
export default defineConfig({
  test: {
    include: ['src/{domain,data}/**/*.test.ts', 'proxy/src/**/*.test.ts'],
    environment: 'node',
  },
});
