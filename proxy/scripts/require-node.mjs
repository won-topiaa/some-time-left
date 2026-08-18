/**
 * Node 버전 확인.
 *
 * `--experimental-strip-types`(22.6+)와 `--env-file-if-exists`(22.9+)를 쓴다.
 * 낮은 버전에서는 알아보기 어려운 오류가 나므로 먼저 걸러 준다.
 */

const REQUIRED_MAJOR = 22;
const REQUIRED_MINOR = 9;

export function requireNode() {
  const [major, minor] = process.versions.node.split('.').map(Number);

  if (major > REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor >= REQUIRED_MINOR)) {
    return;
  }

  console.error(`Node ${REQUIRED_MAJOR}.${REQUIRED_MINOR} 이상이 필요해요. 지금은 ${process.versions.node}입니다.`);
  console.error('');
  console.error('  nvm을 쓰신다면:  nvm install 22 && nvm use 22');
  console.error('  Homebrew라면:    brew install node@22');
  console.error('  또는 nodejs.org에서 LTS를 받으세요.');
  process.exit(1);
}
