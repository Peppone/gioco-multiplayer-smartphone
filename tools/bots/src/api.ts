/** Client REST minimale della regia, per allestire serate e partite di prova. */
export class AdminApi {
  token = "";

  constructor(readonly base: string) {}

  async request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers: { ...(body !== undefined && { "content-type": "application/json" }), ...(this.token && { authorization: `Bearer ${this.token}` }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; detail?: string };
    if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error ?? ""} ${data.detail ?? ""}`.trim());
    return data;
  }

  /** Entra nella regia. Con `allowSetup` imposta la password se il server è nuovo (solo per server di prova). */
  async login(password: string, allowSetup: boolean): Promise<void> {
    const status = await this.request<{ configured: boolean }>("GET", "/api/admin/status");
    if (!status.configured && !allowSetup) throw new Error("Il server non ha ancora una password admin: impostala da /admin.");
    const res = await this.request<{ token: string }>("POST", status.configured ? "/api/admin/login" : "/api/admin/setup", { password });
    this.token = res.token;
  }

  get = <T = any>(path: string) => this.request<T>("GET", `/api/admin${path}`);
  post = <T = any>(path: string, body: unknown) => this.request<T>("POST", `/api/admin${path}`, body);
  put = <T = any>(path: string, body: unknown) => this.request<T>("PUT", `/api/admin${path}`, body);
  patch = <T = any>(path: string, body: unknown) => this.request<T>("PATCH", `/api/admin${path}`, body);
}
