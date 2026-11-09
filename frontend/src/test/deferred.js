/**
 * Creates a deferred promise with exposed resolve and reject handles.
 * Fresh promise and callbacks are created on every invocation.
 */
export function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
