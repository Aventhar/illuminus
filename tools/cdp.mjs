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
  const page = targets.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");

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
  const CALL_TIMEOUT = 180000;

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    const timer = setTimeout(() => {
      if (!pending.has(msgId)) return;
      pending.delete(msgId);
      reject(new Error(`${method} did not answer within ${CALL_TIMEOUT / 1000}s`));
    }, CALL_TIMEOUT);
    pending.set(msgId, {
      method,
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); }
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

  return { send, evaluate, goto, waitFor, mouse, click, logs, close: () => ws.close() };
}
