// Server-only helpers for the player session cookie (HttpOnly).
// Never import from client-reachable modules.
import {
  getCookie,
  setCookie,
  deleteCookie,
  getRequestHeader,
} from "@tanstack/react-start/server";

export const PLAYER_SESSION_COOKIE = "vg_player_session";
const REMEMBER_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 dias

export function readSessionCookie(): string | undefined {
  return getCookie(PLAYER_SESSION_COOKIE) ?? undefined;
}

/**
 * Escreve o cookie de sessão do jogador.
 * - remember=true  → cookie persistente (Max-Age 30 dias).
 * - remember=false → cookie de sessão do navegador (sem Max-Age/Expires).
 */
export function writeSessionCookie(token: string, remember: boolean) {
  setCookie(PLAYER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    ...(remember ? { maxAge: REMEMBER_MAX_AGE_SECONDS } : {}),
  });
}

export function clearSessionCookie() {
  deleteCookie(PLAYER_SESSION_COOKIE, { path: "/" });
}

/**
 * IP do cliente.
 *
 * Em produção (Cloudflare Workers) usamos EXCLUSIVAMENTE `cf-connecting-ip`,
 * conforme recomendação da Cloudflare. Ignoramos `x-forwarded-for` e
 * `x-real-ip` porque podem ser forjados por clientes ou proxies não
 * confiáveis; confiar neles permitiria burlar o rate limit por IP.
 *
 * Se o header não estiver presente (ex: preview local ou requisição fora do
 * edge Cloudflare), retornamos `null`. Nesse caso o rate limit por telefone
 * continua ativo no banco.
 */
export function getRequestIp(): string | null {
  const cf = getRequestHeader("cf-connecting-ip");
  if (cf && cf.trim() !== "") return cf.trim();
  return null;
}

export function getRequestUserAgent(): string | null {
  return getRequestHeader("user-agent") ?? null;
}
