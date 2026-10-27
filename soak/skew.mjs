// Preload (node --import soak/skew.mjs): shifts the clock by SOAK_SKEW_MS, to run the MCP tests under clock skew.
const skew = Number(process.env.SOAK_SKEW_MS || 0);
if (skew) {
  const RealDate = Date;
  const shifted = () => RealDate.now() + skew;
  globalThis.Date = new Proxy(RealDate, {
    construct: (T, args) => (args.length ? new T(...args) : new T(shifted())),
    get: (T, k) => (k === 'now' ? shifted : Reflect.get(T, k)),
    apply: (T) => new RealDate(shifted()).toString(),
  });
}
