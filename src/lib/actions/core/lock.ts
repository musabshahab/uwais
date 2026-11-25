/**
 * One timetable edit at a time.
 *
 * An import reads the stored days, merges the file into them and writes the
 * result back. The database layer makes each of those steps safe on its own,
 * but not the sequence: a day saved by hand between the read and the write
 * would be overwritten with the stale copy. Every action that changes the
 * timetable therefore runs through this queue, so each one sees the result
 * of the one before.
 *
 * The queue is per process, like the database write queue it complements.
 * Two server instances sharing one database are not covered.
 */

/** Queue state, kept on `globalThis` because the dev server re-evaluates modules on every edit. */
interface TimetableQueue {
  /** Settles when the last queued edit has finished, whatever its outcome. */
  tail: Promise<void>;
}

const QUEUE_KEY = Symbol.for("uwais.timetable-edits");

type GlobalWithQueue = typeof globalThis & { [QUEUE_KEY]?: TimetableQueue };

/** The shared queue, created on first use. */
function timetableQueue(): TimetableQueue {
  const scope = globalThis as GlobalWithQueue;
  let queue = scope[QUEUE_KEY];
  if (!queue) {
    queue = { tail: Promise.resolve() };
    scope[QUEUE_KEY] = queue;
  }
  return queue;
}

/**
 * Runs `work` after every timetable edit queued before it has finished, and
 * resolves or rejects with its outcome. A failed edit does not hold up the
 * ones behind it.
 *
 * Do not call it from inside `work`: the inner call would wait for the outer
 * one, which is waiting for it.
 */
export function withTimetableLock<T>(work: () => Promise<T>): Promise<T> {
  const queue = timetableQueue();
  const run = queue.tail.then(work);
  queue.tail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
