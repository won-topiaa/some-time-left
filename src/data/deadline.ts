/**
 * 오래 걸리면 기다리지 않고 대신할 값으로 간다.
 *
 * 길을 찾는 화면에서 "없어도 되는 것"을 기다리지 않기 위해 쓴다. 요청 자체를
 * 끊지는 않는다 — 늦게라도 오면 그건 그것대로 두고, 기다리는 쪽만 먼저 간다.
 */
export async function withDeadline<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([work.catch(() => fallback), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
