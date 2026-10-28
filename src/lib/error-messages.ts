// Traduz códigos de erro do backend para mensagens amigáveis em PT-BR.
// Nunca expõe detalhes internos.
const MAP: Record<string, string> = {
  invalid_credentials: "WhatsApp ou senha incorretos.",
  rate_limited_phone: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  rate_limited_ip: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
  rate_limited: "Muitas buscas. Aguarde alguns segundos.",
  phone_already_registered: "Este WhatsApp já possui cadastro.",
  phone_already_exists: "Este WhatsApp já possui cadastro.",
  invalid_phone: "WhatsApp inválido.",
  invalid_pin: "Senha inválida. Use 4 a 8 dígitos.",
  invalid_name: "Nome muito curto.",
  already_registered: "Este jogador já está inscrito.",
  already_cancelled: "Esta inscrição já foi cancelada.",
  event_not_open: "As inscrições ainda não estão abertas.",
  event_not_found: "Nenhum jogo disponível no momento.",
  player_blocked: "Você não poderá participar deste jogo.",
  player_not_available: "Jogador não disponível.",
  player_not_found: "Jogador não encontrado.",
  main_full: "Lista principal cheia.",
  responsible_limit_reached: "Você já inscreveu 2 jogadores neste jogo.",
  not_authenticated: "Faça login para continuar.",
  invalid_session: "Sua sessão expirou. Entre novamente.",
  already_authenticated: "Você já está autenticado.",
  registration_not_found: "Inscrição não encontrada.",
  not_authorized: "Você não pode alterar esta inscrição.",
  invalid_block_range: "Período de bloqueio inválido.",
  signup_failed: "Não foi possível criar o cadastro. Tente novamente.",
  ALREADY_REGISTERED: "Este WhatsApp já possui cadastro. Acesse pela opção 'Já tenho cadastro'.",
  PHOTO_REQUIRED: "A foto é obrigatória para o cadastro.",
  INVALID_PHONE: "WhatsApp inválido. Informe DDD + número (11 dígitos).",
  STORAGE_ERROR: "Falha ao enviar a foto. Tente novamente.",
  UPDATE_ERROR: "Erro ao atualizar dados do perfil.",
  FORM_DATA_PARSE_FAILED: "Não foi possível processar os dados enviados.",
  UNEXPECTED_SIGNUP_ERROR: "Ocorreu uma falha inesperada durante o cadastro.",
  name_unchanged: "O novo nome é igual ao nome atual.",
  name_too_long: "Nome muito longo.",
  player_inactive: "Cadastro inativo.",
  pin_reset_required: "Você precisa cadastrar uma nova senha para continuar.",
  invalid_new_pin: "Nova senha inválida. Use 4 a 8 dígitos.",
  new_pin_must_differ: "A nova senha deve ser diferente da atual.",
  late_leave_rejoin_forbidden: "Você não pode retornar a esta rodada após confirmar uma saída fora do prazo.",
  not_approved_for_group: "Aguardando aprovação nesta turma.",
};

export function friendlyError(err: unknown): string {
  let raw = "";
  if (err instanceof Error) {
    raw = err.message;
  } else if (typeof err === "object" && err !== null) {
    const o = err as Record<string, unknown>;
    raw = typeof o.message === "string"
      ? o.message
      : typeof o.error_description === "string"
      ? o.error_description
      : typeof o.code === "string"
      ? o.code
      : String(err);
  } else {
    raw = String(err ?? "");
  }

  const code = raw.replace(/^Error:\s*/i, "").trim();

  if (code.startsWith("priority_window_active")) {
    const parts = code.split(":");
    const seconds = Number(parts[1] ?? 0);
    if (seconds > 0) {
      const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
      const ss = String(seconds % 60).padStart(2, "0");
      return `Acesso restrito a jogadores com prioridade. Sua entrada será liberada em ${mm}:${ss}.`;
    }
    return "Acesso restrito a jogadores com prioridade.";
  }

  if (MAP[code]) {
    return MAP[code];
  }

  if (/bloqueado nesta turma/i.test(code)) {
    return code;
  }

  if (/players_phone|23505|phone_already|unique.*phone|duplicate.*phone/i.test(raw)) {
    return MAP.phone_already_registered;
  }

  if (/selecione.*turma/i.test(raw)) {
    return "Selecione pelo menos uma turma para continuar.";
  }

  if (/invalid_name|nome.*curto/i.test(raw)) {
    return MAP.invalid_name;
  }

  if (/gen_salt|pgcrypto|hash_pin/i.test(raw)) {
    return "Erro interno ao processar segurança. Tente novamente.";
  }

  if (/pin must be|invalid.*pin|4-8 digits/i.test(raw)) {
    return MAP.invalid_pin;
  }

  if (/failed to fetch|networkerror|load failed/i.test(raw)) {
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  }

  return "Não foi possível concluir a operação. Tente novamente.";
}
