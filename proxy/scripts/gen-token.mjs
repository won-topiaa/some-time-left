#!/usr/bin/env node
/**
 * PROXY_TOKEN 만들기.
 *
 * 프록시는 토큰 없이는 뜨지 않는다. 토큰이 없으면 주소를 아는 누구나
 * 서울 인증키 할당량을 쓸 수 있기 때문이다.
 */
import { randomBytes } from 'node:crypto';

const token = randomBytes(32).toString('base64url');

console.log(token);
console.error('');
console.error('프록시에 넣기:');
console.error(`  PROXY_TOKEN=${token}`);
console.error('  (Workers면: npx wrangler secret put PROXY_TOKEN)');
console.error('');
console.error('앱에 같은 값 넣기 (src/_app.tsx):');
console.error(`  congestionProxy: { baseUrl: 'https://...', token: '${token}' }`);
