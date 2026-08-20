/**
 * 확장자 없는 상대 임포트를 `.ts`로 이어 준다.
 *
 * 앱 코드는 번들러가 읽으므로 `from './types'`처럼 확장자를 생략해도 된다.
 * 하지만 `node --experimental-strip-types`로 그 파일을 직접 부르면
 * ERR_MODULE_NOT_FOUND로 멈춘다. 스토어 이미지 같은 스크립트가 앱의 토큰·문구를
 * **그대로 가져다 쓰려면** 이 다리가 필요하다 — 베끼면 그 순간부터 어긋난다.
 *
 *   node --import ./scripts/ts-resolve.mjs --experimental-strip-types <script>
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register(new URL('./ts-resolve-hooks.mjs', pathToFileURL(import.meta.filename)));
