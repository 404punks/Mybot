export async function withDeadline<T>(
  deadlineMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T | "deadline"> {
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) return "deadline";
  const controller = new AbortController();
  let settled = false;
  return new Promise<T | "deadline">((resolve) => {
    const finish = (value: T | "deadline") => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      controller.abort();
      finish("deadline");
    }, remaining);
    work(controller.signal).then(
      (value) => finish(controller.signal.aborted ? "deadline" : value),
      () => finish("deadline"),
    );
  });
}
