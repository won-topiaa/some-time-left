import { defineConfig } from 'vitest/config';

// 도메인 계층만 테스트한다. React Native에 의존하지 않는 순수 로직이라
// 네이티브 런타임 없이 CI에서 그대로 돌아간다.
export default defineConfig({
  test: {
    include: ['src/domain/**/*.test.ts'],
    environment: 'node',
  },
});
