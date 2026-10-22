// Aurapoli: server per le stanze online.
// Serve i file del sito (cartella public/) e fa da centralino tra l'host e gli amici
// con un Durable Object per stanza. La partita gira sul telefono dell'host.
import { DurableObject } from "cloudflare:workers";

const CODE = /^\/api\/room\/([A-Z0-9]{4,6})(\/info)?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/ping") return Response.json({ aurapoli: true });
    const m = url.pathname.match(CODE);
    if (m) {
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]));
      return stub.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // risponde ai ping senza svegliare la stanza
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  hosts() { return this.ctx.getWebSockets("host"); }
  send(list, data) { for (const ws of list) { try { ws.send(data); } catch (e) {} } }

  async fetch(request) {
    const url = new URL(request.url);
    const hostKey = await this.ctx.storage.get("hostKey");
    if (url.pathname.endsWith("/info")) {
      return Response.json({ exists: !!hostKey, hostOn: this.hosts().length > 0, people: this.ctx.getWebSockets().length });
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Serve un WebSocket", { status: 426 });

    const role = url.searchParams.get("role") === "host" ? "host" : "guest";
    const cid = (url.searchParams.get("cid") || "").replace(/[^a-z0-9]/gi, "").slice(0, 24) || crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const key = (url.searchParams.get("key") || "").slice(0, 64);
    if (role === "host") {
      if (!key) return new Response("Chiave mancante", { status: 400 });
      if (hostKey && hostKey !== key) return new Response("Stanza già occupata", { status: 403 });
      if (!hostKey) await this.ctx.storage.put("hostKey", key);
    } else if (!hostKey) {
      return new Response("Stanza inesistente", { status: 404 });
    }
    if (this.ctx.getWebSockets().length >= 24) return new Response("Stanza piena", { status: 429 });

    // stessa persona riconnessa: chiude la connessione vecchia
    for (const ws of this.ctx.getWebSockets("c_" + cid)) { try { ws.close(4000, "sostituita"); } catch (e) {} }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server, [role, "c_" + cid]);
    server.serializeAttachment({ cid, role });
    server.send(JSON.stringify({ t: "welcome", cid, role, hostOn: role === "host" || this.hosts().length > 0 }));
    if (role === "host") this.send(this.ctx.getWebSockets("guest"), JSON.stringify({ t: "host", on: true }));
    else this.send(this.hosts(), JSON.stringify({ t: "join", cid }));
    await this.ctx.storage.setAlarm(Date.now() + 24 * 3600 * 1000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 900000) return;
    const a = ws.deserializeAttachment();
    if (!a) return;
    let m;
    try { m = JSON.parse(message); } catch (e) { return; }
    if (!m || typeof m !== "object") return;
    if (a.role === "host") {
      if (m.to) {
        const to = String(m.to).replace(/[^a-z0-9]/gi, "");
        delete m.to;
        this.send(this.ctx.getWebSockets("c_" + to), JSON.stringify(m));
      } else {
        this.send(this.ctx.getWebSockets("guest"), message);
      }
    } else {
      m.from = a.cid;
      this.send(this.hosts(), JSON.stringify(m));
    }
  }

  async webSocketClose(ws, code, reason) { this.gone(ws); try { ws.close(code, reason); } catch (e) {} }
  async webSocketError(ws) { this.gone(ws); }

  gone(ws) {
    const a = ws.deserializeAttachment();
    if (!a) return;
    // se si è già ricollegato con un'altra connessione, non annunciare l'uscita
    const still = this.ctx.getWebSockets("c_" + a.cid).some((x) => x !== ws && x.readyState === 1);
    if (still) return;
    if (a.role === "host") this.send(this.ctx.getWebSockets("guest"), JSON.stringify({ t: "host", on: false }));
    else this.send(this.hosts(), JSON.stringify({ t: "leave", cid: a.cid }));
  }

  async alarm() {
    // stanza abbandonata da un giorno: si cancella
    if (this.ctx.getWebSockets().length === 0) await this.ctx.storage.deleteAll();
    else await this.ctx.storage.setAlarm(Date.now() + 24 * 3600 * 1000);
  }
}
