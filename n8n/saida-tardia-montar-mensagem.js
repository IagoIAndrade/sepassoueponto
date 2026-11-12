const body = $('Webhook').first().json.body || {};
const r = body.rodada || {};
const tz = 'America/Sao_Paulo';
const dataRodada = r.data
  ? new Date(r.data + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' })
  : '';
const horario = [r.horario_inicio, r.horario_fim].filter(Boolean).join(' às ');

const saiuEm = body.saiu_em
  ? new Date(body.saiu_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: tz })
  : '';
const justificativa = (body.justificativa || '').trim();
const rodadas = Number(body.rodadas_bloqueio || 0);

// Saídas antigas (evento "saida_tardia") eram sempre fora do prazo.
const foraDoPrazo = body.evento === 'saida_tardia' || body.fora_do_prazo === true;

const linhas = [
  (foraDoPrazo ? '⚠️ *Saída após o prazo* ' : '🚪 *Saída da lista* ') + (r.turma ? '— ' + r.turma : ''),
  '',
  '👤 *' + body.jogador + '*' + (body.lista ? ' (' + body.lista + ')' : '') + ' saiu da lista' + (saiuEm ? ' em ' + saiuEm : ''),
  body.removido_por === 'admin' ? '🛠️ Nome retirado pelo admin' : '🙋 Saiu pelo próprio app',
  foraDoPrazo ? '⏰ *Fora do prazo*' : '⏰ Dentro do prazo',
  '📅 Rodada: ' + dataRodada + (horario ? ' · ' + horario : ''),
  '📝 Justificativa: ' + (justificativa ? '"' + justificativa + '"' : 'não informada'),
  rodadas > 0 ? '🚫 Penalidade: ' + rodadas + (rodadas === 1 ? ' rodada' : ' rodadas') + ' sem jogar' : null,
].filter((l) => l !== null);

const fmtData = (iso) => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const datas = (body.datas_possivel_bloqueio || []).map(fmtData);
if (datas.length) linhas.push('', '📆 *Possíveis datas de bloqueio* (a justificativa será avaliada):', ...datas.map((x) => '• ' + x));

let privada = null;
let telefone = body.jogador_telefone || null;
if (body.convidado) {
  // Convidado: avisa quem o inseriu na lista (convidado não gera bloqueio).
  telefone = body.convidado_por_telefone || null;
  privada = [
    '🚪 Olá' + (body.convidado_por ? ', ' + body.convidado_por : '') + '! Seu convidado *' + body.jogador + '* foi retirado da lista' + (r.turma ? ' de ' + r.turma : '') + '.',
    '',
    '📅 Rodada: ' + dataRodada + (horario ? ' · ' + horario : ''),
    body.removido_por === 'admin' ? '🛠️ Retirado pelo admin' : '🙋 Retirado pelo app',
    justificativa ? '📝 Observação: "' + justificativa + '"' : null,
  ].filter((l) => l !== null).join('\n');
} else if (foraDoPrazo && telefone) {
  const p = [
    '⚠️ Olá, ' + body.jogador + '! Você saiu da lista' + (r.turma ? ' de ' + r.turma : '') + ' após o prazo (rodada de ' + dataRodada + ').',
    '',
    justificativa ? '📝 Sua justificativa: "' + justificativa + '"' : '📝 Nenhuma justificativa foi informada.',
    '',
    'Sua justificativa será avaliada pelos organizadores para decidir se haverá bloqueio ou não.',
  ];
  if (datas.length) p.push('', '📆 Datas em que você pode ficar bloqueado:', ...datas.map((x) => '• ' + x));
  privada = p.join('\n');
}

return [{ json: { mensagem: linhas.join('\n'), mensagem_privada: privada, telefone } }];
