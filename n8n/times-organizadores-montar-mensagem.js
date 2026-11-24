const body = $('Webhook').first().json.body || {};
const r = body.rodada || {};
const TAMANHO = 6;

const dt = r.data ? new Date(r.data + 'T12:00:00Z') : null;
const diaSemana = dt ? dt.toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' }).toUpperCase() : (r.turma || '').toUpperCase();
const data = dt ? dt.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }) : '';

const blocos = (body.times || []).map((t) => {
  const nomes = (t.jogadores || []).map((j) => String(j.nome).trim().toUpperCase());
  const linhas = [];
  for (let i = 0; i < Math.max(TAMANHO, nomes.length); i++) {
    linhas.push((i + 1) + '. ' + (nomes[i] || ''));
  }
  return 'TIME ' + t.numero + '\n\n' + linhas.join('\n');
});

const texto = [
  '🏐 VALIDAÇÃO DOS TIMES — ' + diaSemana,
  '📅 ' + data,
  '',
  blocos.join('\n\n'),
  '',
  '👀 Confiram os times e respondam aqui no grupo.',
].join('\n');

return [{ json: { mensagem: texto } }];
