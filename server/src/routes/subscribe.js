import express from "express";
import { STATE_LIST } from "../constants.js";

/**
 * @param {{ dispatcher: import("../dispatcher/Dispatcher.js").Dispatcher }} deps
 */
export function createSubscribeRouter(deps) {
  const router = express.Router();

  router.get("/", (req, res) => {
    // SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*"
    });

    const kind = String(req.query.kind ?? "stateChange");
    if (kind !== "stateChange" && kind !== "transition") {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "kind must be stateChange or transition" })}\n\n`);
      res.end();
      return;
    }

    const from = req.query.from ? String(req.query.from) : undefined;
    const to = req.query.to ? String(req.query.to) : undefined;

    if (kind === "transition") {
      if (!from || !to || !STATE_LIST.includes(from) || !STATE_LIST.includes(to)) {
        res.write(
          `event: error\ndata: ${JSON.stringify({
            error: `transition requires valid from/to. Allowed: ${STATE_LIST.join(", ")}`
          })}\n\n`
        );
        res.end();
        return;
      }
    }

    const sub = deps.dispatcher.addSubscription({ kind, from, to, res });

    res.write(`event: hello\n`);
    res.write(
      `data: ${JSON.stringify({
        subscriptionId: sub.id,
        kind: sub.kind,
        from: sub.from,
        to: sub.to
      })}\n\n`
    );

    req.on("close", () => {
      deps.dispatcher.removeSubscription(sub.id);
    });
  });

  return router;
}

