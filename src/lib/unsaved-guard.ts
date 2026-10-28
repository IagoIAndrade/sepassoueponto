// Registro global de alterações não salvas no painel administrativo.
// Permite avisar o administrador antes de trocar de turma ou fechar a aba.

const registry = new Map<string, () => boolean>();
let beforeUnloadInstalled = false;

function installBeforeUnload() {
  if (beforeUnloadInstalled || typeof window === "undefined") return;
  beforeUnloadInstalled = true;
  window.addEventListener("beforeunload", (e) => {
    if (pendingSections().length === 0) return;
    e.preventDefault();
    e.returnValue = "";
  });
}

export function registerUnsaved(key: string, isDirty: () => boolean): () => void {
  installBeforeUnload();
  registry.set(key, isDirty);
  return () => {
    registry.delete(key);
  };
}

export function pendingSections(): string[] {
  const out: string[] = [];
  registry.forEach((fn, key) => {
    try {
      if (fn()) out.push(key);
    } catch {
      /* ignore */
    }
  });
  return out;
}

/**
 * Retorna true quando é seguro prosseguir (nada pendente ou o usuário confirmou
 * descartar). Retorna false quando a navegação deve ser cancelada.
 */
export function confirmDiscardUnsaved(context?: string): boolean {
  const pending = pendingSections();
  if (pending.length === 0) return true;
  if (typeof window === "undefined") return true;
  const list = pending.join(", ");
  return window.confirm(
    `Você tem alterações não salvas em: ${list}.\n\n${
      context ? context + "\n\n" : ""
    }Deseja descartar essas alterações?`,
  );
}
