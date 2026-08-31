/** Minimal Chrome DevTools Protocol client over Node's global WebSocket. */

export async function connect(port = 9222) {
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets.some((t) => t.type === "page")) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  // Foundry's own tab, not something a previous run left behind. Printing
  // writes into an `about:blank` iframe, and a written blank frame reports its
  // *parent's* URL — so a leftover print frame is a page target sitting at
  // /game, indistinguishable from the real tab by URL alone. Its title is the
  // document that was printed; the real tab's is Foundry's own.
  const pages = targets.filter((t) => t.type === "page");
  const page = pages.find((t) => t.title === "Foundry Virtual Tabletop") ?? pages[0];
  if (!page) throw new Error("no page target");

  // And take the leftovers away. `afterprint` never fires in a headless
  // browser, so the module's own tidy-up waits out its five-minute fallback and
  // the frame outlives the run — which is why a browser that had served several
  // long runs would lose its page target mid-check and fail the suite with a
  // dead socket rather than with anything to do with what was being tested.
  //
  // Once at connect is not enough: a single run makes them too. The checks that
  // print leave a frame apiece, and from then on any later check could be the
  // one that dies — it has been three different ones, including checks nobody
  // had touched. `tidy()` below is the same sweep, for a run to call once it
  // has finished printing.
  const tidy = async () => {
    let open = [];
    try {
      open = (await (await fetch(`http://127.0.0.1:${port}/json`)).json())
        .filter((t) => t.type === "page" && t.id !== page.id);
    } catch { return 0; }
    for (const stray of open) {
      try { await fetch(`http://127.0.0.1:${port}/json/close/${stray.id}`); } catch {}
    }
    return open.length;
  };
  await tidy();

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

  let id = 0;
  const pending = new Map();
  const logs = [];

  /**
   * Fail everything still in flight.
   *
   * A message that never comes back is the worst failure this harness has: the
   * await never settles, node runs out of work, and the process exits *quietly*
   * part way through the suite — which reads as "fewer checks passed and none
   * failed" and sends you looking for a bug in whatever check happened to be
   * last. Better a loud error naming the call that went missing.
   */
  const abandon = (why) => {
    for (const [msgId, { reject, method }] of pending) {
      pending.delete(msgId);
      reject(new Error(`${method} never answered: ${why}`));
    }
  };
  ws.onclose = () => abandon("the devtools socket closed");
  ws.onerror = () => abandon("the devtools socket errored");

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method === "Runtime.consoleAPICalled") {
      logs.push({ type: msg.params.type, text: msg.params.args.map(a => a.value ?? a.description ?? "").join(" ") });
    } else if (msg.method === "Runtime.exceptionThrown") {
      logs.push({ type: "exception", text: msg.params.exceptionDetails.exception?.description
        ?? msg.params.exceptionDetails.text });
    }
  };

  /**
   * How long any one protocol call may take before it counts as lost.
   *
   * Generous, because a single call can drive a whole scene — building a style,
   * opening the editor several times, answering a prompt — on a headless
   * browser with no hardware behind it. Short enough that a call which is never
   * coming back still names itself rather than hanging the run.
   */
  // Long enough for the heaviest thing the module draws. The style editor lays
  // out some four and a half thousand controls, and a sandbox renders in
  // software with no GPU — around twenty-five seconds a time, so a check that
  // opens it and then makes it redraw spends the best part of a minute inside
  // one call. The limit is here to name a call that was lost, not to hurry a
  // slow one: keep it well clear of honest work.
  const CALL_TIMEOUT = 300000;

  // What each call cost, when asked for. Set ILLUMINUS_TIME_CALLS=1 to find out
  // what the timeout above should be, rather than guessing at it again.
  const timing = process.env.ILLUMINUS_TIME_CALLS ? [] : null;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    const startedAt = timing ? Date.now() : 0;
    const timer = setTimeout(() => {
      if (!pending.has(msgId)) return;
      pending.delete(msgId);
      reject(new Error(`${method} did not answer within ${CALL_TIMEOUT / 1000}s`));
    }, CALL_TIMEOUT);
    const done = () => {
      clearTimeout(timer);
      if (timing) {
        // The head of the expression as well as the method: "Runtime.evaluate"
        // twelve times over says which call was slow and nothing about which
        // check it belonged to.
        const ms = Date.now() - startedAt;
        const said = String(params.expression ?? "").replace(/\s+/g, " ").trim().slice(0, 70);
        timing.push({ method, ms, said });
        // Said as it happens as well as tallied at the end: every call begins
        // with the same dozen words, so a snippet cannot tell them apart —
        // where it lands in the run can, between the two section headings it
        // falls between.
        if (ms > 10000) console.log(`      ⏱ ${(ms / 1000).toFixed(1)}s`);
      }
    };
    pending.set(msgId, {
      method,
      resolve: (value) => { done(); resolve(value); },
      reject: (error) => { done(); reject(error); }
    });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await send("Runtime.enable");
  await send("Page.enable");

  const evaluate = async (expression, { awaitPromise = true } = {}) => {
    const res = await send("Runtime.evaluate", {
      expression, awaitPromise, returnByValue: true, allowUnsafeEvalBlockedByCSP: true
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result.value;
  };

  const goto = async (url) => {
    await send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 1500));
  };

  /**
   * Poll an expression until it returns true.
   *
   * Errors from the page are swallowed on purpose — the thing being waited for
   * usually does not exist yet, and saying so thirty times is noise. Errors
   * from the *protocol* are not: a socket that has gone away would otherwise
   * spend the whole timeout failing silently and then blame whatever was being
   * waited for, which is a long way to walk to the wrong conclusion.
   */
  const waitFor = async (expression, { timeout = 60000, label = expression } = {}) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(`(() => { try { return !!(${expression}); } catch { return false; } })()`)) return true;
      } catch (error) {
        if (/never answered|did not answer within/.test(error.message)) throw error;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`timed out waiting for: ${label}`);
  };

  /**
   * A real mouse event from the browser's own input pipeline, so that hit
   * testing and `:hover` apply. Dispatching a MouseEvent from a script does
   * neither, which is how a control that CSS has made unclickable can still
   * pass a test.
   */
  /**
   * @param {number} [buttons] Which buttons are held. 1 while dragging: a move
   *   sent with none held is a hover, and a slider does not follow a hover.
   */
  const mouse = async (type, x, y, buttons = 0) => {
    await send("Input.dispatchMouseEvent", {
      type, x, y, button: type === "mouseMoved" && !buttons ? "none" : "left",
      clickCount: type === "mouseMoved" ? 0 : 1, buttons
    });
    await new Promise((r) => setTimeout(r, 60));
  };

  /** Point at a spot and press it, the way a person does. */
  const click = async (x, y) => {
    await mouse("mouseMoved", x, y);
    await mouse("mousePressed", x, y);
    await mouse("mouseReleased", x, y);
  };

  /** The slowest calls of the run, for setting the timeout by measurement. */
  const slowest = (howMany = 10) => (timing ?? [])
    .sort((a, b) => b.ms - a.ms).slice(0, howMany);

  return { send, evaluate, goto, waitFor, mouse, click, logs, slowest, tidy,
    close: () => ws.close() };
}
