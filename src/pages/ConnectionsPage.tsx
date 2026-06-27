import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Wifi, CheckCircle, XCircle, Loader, Key } from "lucide-react";
import type { SshProfile } from "../lib/types";

export function ConnectionsPage() {
  const [profiles, setProfiles] = useState<SshProfile[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [user, setUser] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [keyPath, setKeyPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  async function load() {
    const result = await invoke<SshProfile[]>("list_ssh_profiles");
    setProfiles(result);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!name || !user || !host) return;
    setSaving(true);
    try {
      await invoke("add_ssh_profile", {
        name, user, host,
        port: parseInt(port) || 22,
        keyPath,
      });
      setShowForm(false);
      setName(""); setUser(""); setHost(""); setPort("22"); setKeyPath("");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await invoke("remove_ssh_profile", { id });
    await load();
  }

  async function testConn(id: string) {
    setTesting(id);
    try {
      const msg = await invoke<string>("test_ssh_connection", { profileId: id });
      setTestResult((r) => ({ ...r, [id]: { ok: true, msg } }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [id]: { ok: false, msg: String(e) } }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[#e5e7eb]">Conexiones SSH</h2>
          <p className="text-xs text-[#6b7280]">Hosts remotos para rsync over SSH</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[#3b82f6] text-white hover:bg-[#2563eb] transition-colors"
        >
          <Plus size={13} /> Nueva conexión
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="border border-[#2e2e2e] rounded-lg p-4 bg-[#161616] flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-[#9ca3af] uppercase tracking-wider">Nueva conexión SSH</h3>

          <input placeholder="Nombre (ej: Mi VPS)" value={name} onChange={(e) => setName(e.target.value)}
            className="input-field" />

          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Usuario" value={user} onChange={(e) => setUser(e.target.value)}
              className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]" />
            <input placeholder="Host / IP" value={host} onChange={(e) => setHost(e.target.value)}
              className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]" />
            <input placeholder="Puerto" value={port} onChange={(e) => setPort(e.target.value)}
              className="bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]" />
          </div>

          <div className="flex items-center gap-2">
            <Key size={13} className="text-[#6b7280] shrink-0" />
            <input
              placeholder="Clave privada (opcional, ej: /home/user/.ssh/id_rsa)"
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              className="flex-1 bg-[#1e1e1e] border border-[#3a3a3a] rounded px-3 py-2 text-xs text-[#e5e7eb] font-mono outline-none focus:border-[#3b82f6]"
            />
          </div>

          <p className="text-[11px] text-[#6b7280]">
            Si no especificás clave, SSH usará el agente o la clave por defecto (~/.ssh/id_rsa).
          </p>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)}
              className="px-3 py-1.5 rounded text-xs text-[#9ca3af] hover:text-[#e5e7eb] border border-[#3a3a3a]">
              Cancelar
            </button>
            <button onClick={add} disabled={saving || !name || !user || !host}
              className="px-4 py-1.5 rounded text-xs bg-[#3b82f6] text-white hover:bg-[#2563eb] disabled:opacity-50 transition-colors">
              {saving ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>
      )}

      {/* Profile list */}
      {profiles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-[#6b7280]">
          <Wifi size={32} className="opacity-30" />
          <span className="text-xs">No hay conexiones SSH guardadas</span>
          <span className="text-[11px] text-[#4b5563]">Agregá un VPS o servidor remoto para usar rsync over SSH</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {profiles.map((p) => {
            const result = testResult[p.id];
            const isTesting = testing === p.id;
            return (
              <div key={p.id}
                className="flex items-center gap-3 px-4 py-3 bg-[#161616] rounded-lg border border-[#2e2e2e]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-[#e5e7eb]">{p.name}</span>
                    {result && (
                      result.ok
                        ? <CheckCircle size={13} className="text-[#10b981]" />
                        : <XCircle size={13} className="text-[#ef4444]" />
                    )}
                  </div>
                  <div className="text-[11px] text-[#6b7280] font-mono">
                    {p.user}@{p.host}:{p.port}
                    {p.key_path && <span className="text-[#4b5563] ml-2">🔑 {p.key_path.split("/").pop()}</span>}
                  </div>
                  {result && !result.ok && (
                    <div className="text-[11px] text-[#ef4444] mt-1 font-mono truncate">{result.msg}</div>
                  )}
                </div>

                <button onClick={() => testConn(p.id)} disabled={isTesting}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] border border-[#3a3a3a] text-[#9ca3af] hover:text-white hover:border-[#4a4a4a] disabled:opacity-50 transition-colors">
                  {isTesting ? <Loader size={11} className="animate-spin" /> : <Wifi size={11} />}
                  {isTesting ? "Probando..." : "Test"}
                </button>

                <button onClick={() => remove(p.id)}
                  className="p-1.5 rounded text-[#6b7280] hover:text-[#ef4444] hover:bg-[#2e2e2e] transition-colors">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
