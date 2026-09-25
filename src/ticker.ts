// One requestAnimationFrame loop for every animate() on the page, running only
// while something is playing.
//
// A job may end and start again inside its own frame (an onComplete that plays
// the animation back): it is kept, not dropped with the run that ended. And a
// job added during a frame joins the loop already running rather than starting
// a second one.

type Job = (now: number) => boolean;

const jobs = new Set<Job>();
/** jobs added (or added again) while the current frame runs */
const fresh = new Set<Job>();
let raf = 0;
let inFrame = false;

/** an error in someone's onUpdate or onComplete: reported as uncaught, without stopping everyone else */
const report = (err: unknown) => {
  if (typeof reportError === 'function') reportError(err);
  else setTimeout(() => {
    throw err;
  });
};

const frame = (now: number) => {
  raf = 0;
  inFrame = true;
  fresh.clear();
  try {
    for (const job of Array.from(jobs)) {
      if (!jobs.has(job)) continue;
      let keep = false;
      try {
        keep = job(now);
      } catch (err) {
        // that job ends; the others, and any started later, go on
        report(err);
      }
      if (!keep && !fresh.has(job)) jobs.delete(job);
    }
  } finally {
    inFrame = false;
    if (jobs.size && !raf) raf = requestAnimationFrame(frame);
  }
};

/** Run `job` every frame until it returns false; the returned function stops it. */
export function every(job: Job): () => void {
  jobs.add(job);
  if (inFrame) fresh.add(job);
  else if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(frame);
  return () => {
    jobs.delete(job);
    fresh.delete(job);
  };
}

/** Whether the reader asked for less motion, now. */
export function prefersReduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
