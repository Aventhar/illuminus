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

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    pending.set(msgId, { resolve, reject });
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

  /** Poll an expression until it returns true. */
  const waitFor = async (expression, { timeout = 60000, label = expression } = {}) => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      try {
        if (await evaluate(`(() => { try { return !!(${expression}); } catch { return false; } })()`)) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`timed out waiting for: ${label}`);
  };

  return { send, evaluate, goto, waitFor, logs, close: () => ws.close() };
}
