/* Paraways — interacciones, wizard «Verificá tu ruta», analytics de funnel.
   El idioma se toma de <html lang>; los textos del wizard viven en WZ_UI[lang]. */

const LANG = document.documentElement.lang.startsWith('pt') ? 'pt' : 'es';

const track = (name, data) => {
  if (window.va) window.va('event', { name, ...(data ? { data } : {}) });
};

/* ── Datos del wizard ──────────────────────────────────────── */

const ROUTES = {
  br: {
    flag: '🇧🇷',
    treaty: 'mercosur',
    name: { es: 'Brasil', pt: 'Brasil' },
    tagline: {
      es: 'MERCOSUR · sin traducción de documentos',
      pt: 'MERCOSUL · sem tradução de documentos',
    },
    summary: {
      es: 'Procedimiento simplificado por el Acuerdo MERCOSUR: residencia temporaria (2 años) y luego permanente. Los documentos brasileños en portugués no requieren traducción.',
      pt: 'Procedimento simplificado pelo Acordo MERCOSUL: residência temporária (2 anos) e depois a permanente. Documentos brasileiros em português não precisam de tradução — nem para a Migração.',
    },
    docs: {
      es: ['Pasaporte o documento de identidad vigente', 'Certidão de nascimento apostillada en Brasil', 'Antecedentes criminais (últimos 5 años) apostillados', 'Certidão de estado civil, si corresponde', 'Constancia de ingreso a Paraguay — conservala siempre'],
      pt: ['Documento de identidade ou passaporte válido', 'Certidão de nascimento apostilada no Brasil', 'Atestado de antecedentes criminais (últimos 5 anos) apostilado', 'Certidão de estado civil, se aplicável', 'Comprovante de entrada no Paraguai — guarde sempre'],
    },
    risks: {
      es: ['Apostilla faltante, vencida o ilegible', 'Perder la ventana de 90 días para pedir la permanente (mes 21–24)', 'No conservar la constancia de ingreso al país'],
      pt: ['Apostila faltando, vencida ou ilegível', 'Perder a janela de 90 dias para pedir a permanente (mês 21–24)', 'Não guardar o comprovante de entrada no país'],
    },
    bonus: {
      es: ['Documentos en portugués: exentos de traducción', 'Con una procuração seguimos el trámite aunque vuelvas a Brasil'],
      pt: ['Documentos em português: dispensados de tradução', 'Com uma procuração, seguimos tudo em seu nome mesmo depois que você voltar ao Brasil'],
    },
  },
  ar: {
    flag: '🇦🇷',
    treaty: 'mercosur',
    name: { es: 'Argentina', pt: 'Argentina' },
    tagline: { es: 'MERCOSUR · legalización simplificada', pt: 'MERCOSUL · legalização simplificada' },
    summary: {
      es: 'Residencia MERCOSUR con legalización simplificada: temporaria de 2 años y luego permanente, con cédula al final del camino.',
      pt: 'Residência MERCOSUL com legalização simplificada: temporária de 2 anos e depois a permanente, com cédula ao final.',
    },
    docs: {
      es: ['Pasaporte o DNI vigente', 'Partida de nacimiento apostillada', 'Antecedentes penales (últimos 5 años) apostillados', 'Acta de estado civil, si corresponde', 'Constancia de ingreso a Paraguay'],
      pt: ['Passaporte ou DNI válido', 'Certidão de nascimento apostilada', 'Antecedentes penais (últimos 5 anos) apostilados', 'Certidão de estado civil, se aplicável', 'Comprovante de entrada no Paraguai'],
    },
    risks: {
      es: ['Antecedentes provinciales faltantes', 'Residencia fiscal argentina aún activa al pedir el RUC', 'Perder la ventana de 90 días para la permanente'],
      pt: ['Antecedentes provinciais faltando', 'Residência fiscal argentina ainda ativa ao pedir o RUC', 'Perder a janela de 90 dias para a permanente'],
    },
  },
  us: {
    flag: '🇺🇸',
    treaty: 'haya',
    name: { es: 'Estados Unidos', pt: 'Estados Unidos' },
    tagline: { es: 'Apostilla Secretary of State · FBI check', pt: 'Apostila Secretary of State · FBI check' },
    summary: {
      es: 'Procedimiento general con apostilla de La Haya y traducción pública al español. El FBI Identity History Summary se apostilla ante el Departamento de Estado.',
      pt: 'Procedimento geral com Apostila da Haia e tradução pública ao espanhol. O FBI Identity History Summary é apostilado no Departamento de Estado.',
    },
    docs: {
      es: ['Pasaporte vigente (mín. 6 meses)', 'Birth certificate apostillado', 'FBI Identity History Summary apostillado', 'Marriage / divorce records si aplica', 'Constancia de ingreso a Paraguay'],
      pt: ['Passaporte válido (mín. 6 meses)', 'Birth certificate apostilado', 'FBI Identity History Summary apostilado', 'Marriage / divorce records se aplicável', 'Comprovante de entrada no Paraguai'],
    },
    risks: {
      es: ['Apostilla emitida por la autoridad incorrecta', 'La residencia paraguaya no exime obligaciones fiscales federales (FATCA/FBAR)', 'Traducción pública pendiente'],
      pt: ['Apostila emitida pela autoridade errada', 'A residência paraguaia não isenta obrigações fiscais federais (FATCA/FBAR)', 'Tradução pública pendente'],
    },
  },
  de: {
    flag: '🇩🇪',
    treaty: 'haya',
    name: { es: 'Alemania', pt: 'Alemanha' },
    tagline: { es: 'Führungszeugnis apostillado', pt: 'Führungszeugnis apostilado' },
    summary: {
      es: 'Procedimiento general: apostilla de La Haya y traducción pública. El Führungszeugnis tiene vigencia limitada — conviene pedirlo cerca del viaje.',
      pt: 'Procedimento geral: Apostila da Haia e tradução pública. O Führungszeugnis tem validade limitada — melhor pedir perto da viagem.',
    },
    docs: {
      es: ['Pasaporte vigente', 'Geburtsurkunde apostillada', 'Führungszeugnis apostillado', 'Acta de estado civil, si corresponde', 'Constancia de ingreso a Paraguay'],
      pt: ['Passaporte válido', 'Geburtsurkunde apostilada', 'Führungszeugnis apostilado', 'Certidão de estado civil, se aplicável', 'Comprovante de entrada no Paraguai'],
    },
    risks: {
      es: ['Führungszeugnis vencido al momento de presentar', 'Planificación de salida fiscal (Wegzugsbesteuerung) sin coordinar', 'Traducción pública pendiente'],
      pt: ['Führungszeugnis vencido na hora de apresentar', 'Planejamento de saída fiscal (Wegzugsbesteuerung) sem coordenar', 'Tradução pública pendente'],
    },
  },
  es: {
    flag: '🇪🇸',
    treaty: 'haya',
    name: { es: 'España', pt: 'Espanha' },
    tagline: { es: 'Apostilla Min. Justicia · sin traducción', pt: 'Apostila Min. Justiça · sem tradução' },
    summary: {
      es: 'Procedimiento general con apostilla del Ministerio de Justicia. Al estar en español, la documentación no requiere traducción.',
      pt: 'Procedimento geral com apostila do Ministério da Justiça. Por já estar em espanhol, a documentação não precisa de tradução.',
    },
    docs: {
      es: ['Pasaporte o DNI vigente', 'Certificado de nacimiento apostillado', 'Certificado de antecedentes penales apostillado (vigencia 90 días)', 'Acta de estado civil, si corresponde', 'Constancia de ingreso a Paraguay'],
      pt: ['Passaporte ou DNI válido', 'Certidão de nascimento apostilada', 'Certificado de antecedentes penais apostilado (validade 90 dias)', 'Certidão de estado civil, se aplicável', 'Comprovante de entrada no Paraguai'],
    },
    risks: {
      es: ['Antecedentes sin apostilla del Ministerio de Justicia', 'Vigencia de 90 días vencida al ingresar', 'Estado civil desactualizado'],
      pt: ['Antecedentes sem apostila do Ministério da Justiça', 'Validade de 90 dias vencida ao entrar', 'Estado civil desatualizado'],
    },
  },
  fr: {
    flag: '🇫🇷',
    treaty: 'haya',
    name: { es: 'Francia', pt: 'França' },
    tagline: { es: "Apostille Cour d'appel · Bulletin n°3", pt: "Apostille Cour d'appel · Bulletin n°3" },
    summary: {
      es: "Procedimiento general: apostilla de la Cour d'appel, Bulletin n°3 de antecedentes y traducción pública al español.",
      pt: "Procedimento geral: apostila da Cour d'appel, Bulletin n°3 de antecedentes e tradução pública ao espanhol.",
    },
    docs: {
      es: ['Pasaporte vigente', 'Acte de naissance apostillado', 'Bulletin n°3 apostillado', 'Acta de estado civil, si corresponde', 'Constancia de ingreso a Paraguay'],
      pt: ['Passaporte válido', 'Acte de naissance apostilado', 'Bulletin n°3 apostilado', 'Certidão de estado civil, se aplicável', 'Comprovante de entrada no Paraguai'],
    },
    risks: {
      es: ["Apostilla de una Cour d'appel sin competencia sobre el documento", 'Traducción pública pendiente', 'Vigencias vencidas entre apostilla y presentación'],
      pt: ["Apostila de uma Cour d'appel sem competência sobre o documento", 'Tradução pública pendente', 'Validades vencidas entre apostila e apresentação'],
    },
  },
  ru: {
    flag: '🇷🇺',
    treaty: 'haya',
    name: { es: 'Rusia', pt: 'Rússia' },
    tagline: { es: 'Apostilla Min. Justicia · revisión reforzada', pt: 'Apostila Min. Justiça · revisão reforçada' },
    summary: {
      es: 'Procedimiento general con apostilla del Ministerio de Justicia y traducción pública. La banca local aplica análisis de cumplimiento ampliado.',
      pt: 'Procedimento geral com apostila do Ministério da Justiça e tradução pública. Os bancos locais aplicam análise de compliance ampliada.',
    },
    docs: {
      es: ['Pasaporte vigente', 'Certificado de nacimiento apostillado', 'Antecedentes penales apostillados', 'Acta de estado civil, si corresponde', 'Constancia de ingreso a Paraguay'],
      pt: ['Passaporte válido', 'Certidão de nascimento apostilada', 'Antecedentes penais apostilados', 'Certidão de estado civil, se aplicável', 'Comprovante de entrada no Paraguai'],
    },
    risks: {
      es: ['Revisión bancaria reforzada por origen de fondos', 'Traducción pública pendiente', 'Documentos emitidos por autoridades no reconocidas'],
      pt: ['Revisão bancária reforçada por origem de fundos', 'Tradução pública pendente', 'Documentos emitidos por autoridades não reconhecidas'],
    },
  },
  otro: {
    flag: '🌐',
    treaty: 'general',
    name: { es: 'Otro país', pt: 'Outro país' },
    tagline: { es: 'Ruta a medida · pre-revisión sin costo', pt: 'Rota sob medida · pré-revisão sem custo' },
    summary: {
      es: 'Definimos la ruta según los convenios vigentes con tu país: apostilla o legalización consular, traducción y requisitos específicos.',
      pt: 'Definimos a rota conforme os convênios vigentes com o seu país: apostila ou legalização consular, tradução e requisitos específicos.',
    },
    docs: {
      es: ['Pasaporte vigente', 'Certificado de nacimiento legalizado o apostillado', 'Antecedentes penales legalizados o apostillados', 'Acta de estado civil, si corresponde', 'Constancia de ingreso a Paraguay'],
      pt: ['Passaporte válido', 'Certidão de nascimento legalizada ou apostilada', 'Antecedentes penais legalizados ou apostilados', 'Certidão de estado civil, se aplicável', 'Comprovante de entrada no Paraguai'],
    },
    risks: {
      es: ['Convenio de legalización a confirmar según el país emisor', 'Traducción pública al español', 'Plazos de legalización consular'],
      pt: ['Convênio de legalização a confirmar conforme o país emissor', 'Tradução pública ao espanhol', 'Prazos de legalização consular'],
    },
  },
};

const PACKAGES = {
  residency: {
    price: 'USD 1.450',
    name: { es: 'Residencia y cédula', pt: 'Residência e cédula' },
    blurb: {
      es: 'Pre-revisión documental, acompañamiento presencial en Migraciones, tramitación de cédula y seguimiento del expediente hasta el final.',
      pt: 'Pré-revisão documental, acompanhamento presencial na Migração, emissão da cédula e acompanhamento do processo até o fim.',
    },
  },
  investor: {
    price: 'USD 70.000+',
    priceNote: { es: 'inversión mínima según la vía elegida', pt: 'investimento mínimo conforme a via escolhida' },
    name: { es: 'Investor Pass — permanente directa', pt: 'Investor Pass — permanente direta' },
    blurb: {
      es: 'Residencia permanente directa por inversión (Res. MIC 0283/2026, ventanilla SUACE): estructuración de la inversión calificada y expediente completo, sin pasar por los 2 años de temporaria.',
      pt: 'Residência permanente direta por investimento (Res. MIC 0283/2026, guichê SUACE): estruturação do investimento qualificado e processo completo, sem passar pelos 2 anos de temporária.',
    },
  },
  company: {
    price: 'USD 1.850',
    name: { es: 'Constitución de empresa', pt: 'Abertura de empresa' },
    blurb: {
      es: 'EAS, S.R.L. o S.A. — o una S.A. lista para operar: estatutos, inscripciones, registros y RUC coordinados como un solo trámite.',
      pt: 'EAS, S.R.L. ou S.A. — ou uma S.A. pronta para operar: estatutos, inscrições, registros e RUC coordenados como um único trâmite.',
    },
  },
  banking: {
    price: 'USD 680',
    name: { es: 'Apoyo bancario', pt: 'Apoio bancário' },
    blurb: {
      es: 'Carpeta KYC, selección de banco según perfil y acompañamiento en la apertura. La aprobación es decisión soberana de cada entidad.',
      pt: 'Pasta KYC, escolha do banco conforme o perfil e acompanhamento na abertura. A aprovação é decisão soberana de cada instituição.',
    },
  },
  base: {
    price: 'USD 4.900',
    name: { es: 'Paraguay Operating Base', pt: 'Paraguay Operating Base' },
    blurb: {
      es: 'Residencia + cédula + RUC + empresa + banca + contabilidad, orquestados como un único proyecto con abogado dedicado.',
      pt: 'Residência + cédula + RUC + empresa + banco + contabilidade, orquestrados como um único projeto com advogado dedicado.',
    },
  },
};

const WZ_UI = {
  es: {
    stepLabel: (a, b) => `Paso ${a} de ${b}`,
    steps: {
      country: { q: '¿Cuál es tu <em>nacionalidad?</em>', sub: 'Tu pasaporte define el procedimiento: MERCOSUR, La Haya o ruta general. Nosotros lo conocemos de memoria.' },
      goal: { q: '¿Qué necesitás <em>establecer?</em>', sub: 'Elegí una o varias piezas. Después las orquestamos como un solo expediente.' },
      family: { q: '¿Quién <em>llega?</em>', sub: 'La familia condiciona los documentos: estado civil, cónyuge e hijos menores.' },
      timeline: { q: '¿En qué <em>plazo?</em>', sub: 'Ajustamos prioridades. Los plazos finales dependen de los organismos públicos.' },
      docs: { q: '¿Cómo está tu <em>documentación?</em>', sub: 'Cuanto más completa, antes arranca el procedimiento.' },
    },
    goals: [
      { id: 'residency', b: 'Residencia + cédula', s: 'Instalarme legalmente' },
      { id: 'investor', b: 'Investor Pass', s: 'Permanente directa por inversión' },
      { id: 'company', b: 'Empresa / sociedad', s: 'Constituir o comprar una S.A.' },
      { id: 'banking', b: 'Cuenta bancaria', s: 'Carpeta KYC y apertura' },
      { id: 'base', b: 'Base operativa completa', s: 'Todo, orquestado' },
    ],
    family: [
      { id: 'solo', b: 'Viajo solo/a', s: 'Un solo expediente' },
      { id: 'pareja', b: 'Con mi pareja', s: 'Cónyuge en el mismo proceso' },
      { id: 'hijos', b: 'Con hijos menores', s: 'Requisitos adicionales' },
    ],
    timeline: [
      { id: 'asap', b: 'Lo antes posible' },
      { id: '3m', b: 'En 3 meses' },
      { id: '6m', b: 'En 6 meses' },
      { id: '12m', b: 'Este año' },
    ],
    docs: [
      { id: 'ready', b: 'Tengo todo apostillado', s: 'Listo para presentar' },
      { id: 'partial', b: 'Tengo una parte', s: 'Faltan detalles' },
      { id: 'none', b: 'Todavía no empecé', s: 'Necesito la lista' },
    ],
    next: 'Continuar',
    see: 'Ver mi ruta',
    resultTag: { mercosur: 'Ruta MERCOSUR', haya: 'Ruta La Haya', general: 'Ruta general' },
    recommended: 'Paquete sugerido',
    from: 'desde',
    checklist: 'Checklist documental',
    timelineLabel: 'Plazo estimado',
    days: 'días',
    timelineNote: 'Sujeto a revisión documental y procesamiento de Migraciones / DNIT / Identificaciones.',
    risksLabel: 'Banderas de atención',
    bonusLabel: 'Buenas noticias',
    ctaEyebrow: 'Próximo paso',
    ctaTitle: 'Convertí esta ruta en un expediente.',
    ctaWa: 'Enviar mi ruta por WhatsApp',
    ctaForm: 'Completar consulta',
    resultNote: 'Resumen orientativo, no vinculante: la ruta final la valida un abogado matriculado con tus documentos a la vista.',
    source: 'Fuentes: Acuerdo de Residencia MERCOSUR (Decisión CMC 28/02) · Ley 6984/2022 · Res. MIC 0283/2026 · migraciones.gov.py',
    waIntro: 'Hola, completé el pre-check en paraways.com y quiero avanzar.',
    extraDocs: {
      pareja: 'Acta de matrimonio o unión apostillada',
      hijos: 'Partidas de nacimiento de los menores apostilladas + autorización de ambos progenitores',
    },
    riskDocsNone: 'Recopilación documental sin iniciar: sumá 30–60 días estimados',
    riskMinors: 'Menores de 18: firman acompañados de ambos padres o tutores',
    investorTimeline: '90–120',
    investorTimelineNote: 'Permanente directa vía ventanilla SUACE, sin los 2 años de temporaria.',
  },
  pt: {
    stepLabel: (a, b) => `Etapa ${a} de ${b}`,
    steps: {
      country: { q: 'Qual é a sua <em>nacionalidade?</em>', sub: 'Seu passaporte define o procedimento: MERCOSUL, Haia ou rota geral. Nós conhecemos cada um de cor.' },
      goal: { q: 'O que você precisa <em>estabelecer?</em>', sub: 'Escolha uma ou várias peças. Depois orquestramos tudo como um único processo.' },
      family: { q: 'Quem <em>chega?</em>', sub: 'A família condiciona os documentos: estado civil, cônjuge e filhos menores.' },
      timeline: { q: 'Em qual <em>prazo?</em>', sub: 'Ajustamos as prioridades. Os prazos finais dependem dos órgãos públicos.' },
      docs: { q: 'Como está a sua <em>documentação?</em>', sub: 'Quanto mais completa, antes o procedimento começa.' },
    },
    goals: [
      { id: 'residency', b: 'Residência + cédula', s: 'Me instalar legalmente' },
      { id: 'investor', b: 'Investor Pass', s: 'Permanente direta por investimento' },
      { id: 'company', b: 'Empresa / sociedade', s: 'Abrir ou comprar uma S.A.' },
      { id: 'banking', b: 'Conta bancária', s: 'Pasta KYC e abertura' },
      { id: 'base', b: 'Base operacional completa', s: 'Tudo, orquestrado' },
    ],
    family: [
      { id: 'solo', b: 'Viajo sozinho/a', s: 'Um único processo' },
      { id: 'pareja', b: 'Com meu cônjuge', s: 'Cônjuge no mesmo processo' },
      { id: 'hijos', b: 'Com filhos menores', s: 'Requisitos adicionais' },
    ],
    timeline: [
      { id: 'asap', b: 'O quanto antes' },
      { id: '3m', b: 'Em 3 meses' },
      { id: '6m', b: 'Em 6 meses' },
      { id: '12m', b: 'Este ano' },
    ],
    docs: [
      { id: 'ready', b: 'Tenho tudo apostilado', s: 'Pronto para apresentar' },
      { id: 'partial', b: 'Tenho uma parte', s: 'Faltam detalhes' },
      { id: 'none', b: 'Ainda não comecei', s: 'Preciso da lista' },
    ],
    next: 'Continuar',
    see: 'Ver minha rota',
    resultTag: { mercosur: 'Rota MERCOSUL', haya: 'Rota Haia', general: 'Rota geral' },
    recommended: 'Pacote sugerido',
    from: 'a partir de',
    checklist: 'Checklist de documentos',
    timelineLabel: 'Prazo estimado',
    days: 'dias',
    timelineNote: 'Sujeito à revisão documental e ao processamento da Migração / DNIT / Identificaciones.',
    risksLabel: 'Pontos de atenção',
    bonusLabel: 'Duas boas notícias',
    ctaEyebrow: 'Próximo passo',
    ctaTitle: 'Transforme essa rota em um processo.',
    ctaWa: 'Enviar minha rota por WhatsApp',
    ctaForm: 'Completar consulta',
    resultNote: 'Resumo orientativo, não vinculante: a rota final é validada por um advogado registrado com os seus documentos em mãos.',
    source: 'Fontes: Acordo de Residência MERCOSUL (Decisão CMC 28/02) · Lei 6984/2022 · Res. MIC 0283/2026 · migraciones.gov.py',
    waIntro: 'Olá! Completei o pré-check em paraways.com e quero avançar.',
    extraDocs: {
      pareja: 'Certidão de casamento ou união apostilada',
      hijos: 'Certidões de nascimento dos menores apostiladas + autorização de ambos os pais',
    },
    riskDocsNone: 'Documentação ainda não iniciada: some 30–60 dias estimados',
    riskMinors: 'Menores de 18: assinam acompanhados de ambos os pais ou tutores',
    investorTimeline: '90–120',
    investorTimelineNote: 'Permanente direta via guichê SUACE, sem os 2 anos de temporária.',
  },
};

const WA_NUMBER = '595993474309';

/* ── Wizard ────────────────────────────────────────────────── */

const wizardEl = document.querySelector('#wizard');

function initWizard() {
  if (!wizardEl) return;
  const ui = WZ_UI[LANG];
  const order = ['country', 'goal', 'family', 'timeline', 'docs', 'result'];
  const state = { country: '', goal: [], family: '', timeline: '', docs: '' };
  let step = 0;
  let started = false;

  const stepsBar = wizardEl.querySelector('.wizard-steps');
  const countEl = wizardEl.querySelector('.wizard-count');
  const body = wizardEl.querySelector('.wizard-body');
  const foot = wizardEl.querySelector('.wizard-foot');
  const backBtn = wizardEl.querySelector('.wizard-back');
  const nextBtn = wizardEl.querySelector('.wizard-next');

  const canAdvance = () => {
    const cur = order[step];
    if (cur === 'country') return !!state.country;
    if (cur === 'goal') return state.goal.length > 0;
    if (cur === 'family') return !!state.family;
    if (cur === 'timeline') return !!state.timeline;
    if (cur === 'docs') return !!state.docs;
    return false;
  };

  const optBtn = ({ flag, b, s, sel }) =>
    `<button type="button" class="opt${sel ? ' sel' : ''}">` +
    (flag ? `<span class="flag" aria-hidden="true">${flag}</span>` : '') +
    `<span><b>${b}</b>${s ? `<small>${s}</small>` : ''}</span><span class="tick" aria-hidden="true">✓</span></button>`;

  function render() {
    const cur = order[step];
    stepsBar.innerHTML = order.slice(0, -1).map((_, i) => `<i class="${i <= step ? 'done' : ''}"></i>`).join('');
    countEl.textContent = cur === 'result' ? '' : ui.stepLabel(step + 1, order.length - 1);
    backBtn.disabled = step === 0;
    foot.style.display = cur === 'result' ? 'none' : '';

    if (cur === 'result') { renderResult(); return; }

    const head = `<h3 class="wizard-q">${ui.steps[cur].q}</h3><p class="wizard-sub">${ui.steps[cur].sub}</p>`;

    if (cur === 'country') {
      body.innerHTML = head + '<div class="opt-grid">' + Object.entries(ROUTES).map(([id, r]) =>
        optBtn({ flag: r.flag, b: r.name[LANG], s: r.tagline[LANG], sel: state.country === id })
      ).join('') + '</div>';
      [...body.querySelectorAll('.opt')].forEach((el, i) => {
        el.addEventListener('click', () => { state.country = Object.keys(ROUTES)[i]; render(); advanceSoon(); });
      });
    } else if (cur === 'goal') {
      body.innerHTML = head + '<div class="opt-grid two">' + ui.goals.map((g) =>
        optBtn({ b: g.b, s: g.s, sel: state.goal.includes(g.id) })
      ).join('') + '</div>';
      [...body.querySelectorAll('.opt')].forEach((el, i) => {
        el.addEventListener('click', () => {
          const id = ui.goals[i].id;
          state.goal = state.goal.includes(id) ? state.goal.filter((x) => x !== id) : [...state.goal, id];
          render();
        });
      });
    } else {
      const list = ui[cur];
      body.innerHTML = head + '<div class="opt-grid two">' + list.map((o) =>
        optBtn({ b: o.b, s: o.s, sel: state[cur] === o.id })
      ).join('') + '</div>';
      [...body.querySelectorAll('.opt')].forEach((el, i) => {
        el.addEventListener('click', () => { state[cur] = list[i].id; render(); advanceSoon(); });
      });
    }
    nextBtn.disabled = !canAdvance();
    nextBtn.innerHTML = (step === order.length - 2 ? ui.see : ui.next) + ' <span>↗</span>';
    if (!started) { started = true; track('precheck_start'); }
  }

  let advanceTimer;
  function advanceSoon() {
    clearTimeout(advanceTimer);
    advanceTimer = setTimeout(() => {
      if (canAdvance() && step < order.length - 1) { step += 1; render(); }
    }, 380);
  }

  function buildRoute() {
    const r = ROUTES[state.country];
    const wantsInvestor = state.goal.includes('investor');
    const wantsBase = state.goal.includes('base') || state.goal.length >= 3;
    const pkgId = wantsBase ? 'base'
      : wantsInvestor ? 'investor'
        : state.goal.includes('company') ? 'company'
          : state.goal.includes('banking') ? 'banking'
            : 'residency';
    const pkg = PACKAGES[pkgId];

    let daysLabel = r.treaty === 'mercosur' ? '60–120' : '90–180';
    let timelineNote = WZ_UI[LANG].timelineNote;
    if (wantsInvestor) { daysLabel = WZ_UI[LANG].investorTimeline; timelineNote = WZ_UI[LANG].investorTimelineNote; }

    const docs = [...r.docs[LANG]];
    if (state.family === 'pareja') docs.push(WZ_UI[LANG].extraDocs.pareja);
    if (state.family === 'hijos') docs.push(WZ_UI[LANG].extraDocs.hijos);

    const risks = [...r.risks[LANG]];
    if (state.docs === 'none') risks.push(WZ_UI[LANG].riskDocsNone);
    if (state.family === 'hijos') risks.push(WZ_UI[LANG].riskMinors);

    return { r, pkg, pkgId, daysLabel, timelineNote, docs, risks };
  }

  function renderResult() {
    const ui2 = WZ_UI[LANG];
    const { r, pkg, pkgId, daysLabel, timelineNote, docs, risks } = buildRoute();
    const priceNote = pkg.priceNote ? ` · ${pkg.priceNote[LANG]}` : '';
    const bonus = r.bonus ? `<div class="route-stat" style="border-color:rgba(47,93,58,.4)">
        <p class="eyebrow" style="color:var(--ok)">${ui2.bonusLabel}</p>
        <ul class="route-docs route-bonus" style="border:0;padding-top:2px">${r.bonus[LANG].map((b) => `<li>${b}</li>`).join('')}</ul>
      </div>` : '';

    body.innerHTML = `<div class="route-result">
      <div class="route-main">
        <span class="route-tag">${r.flag} ${ui2.resultTag[r.treaty]}</span>
        <h3>${pkg.name[LANG]}</h3>
        <p class="route-summary">${pkg.blurb[LANG]}</p>
        <p class="route-summary" style="margin-bottom:0">${r.summary[LANG]}</p>
        <p class="eyebrow" style="margin:20px 0 0">${ui2.checklist}</p>
        <ul class="route-docs">${docs.map((d) => `<li>${d}</li>`).join('')}</ul>
      </div>
      <div class="route-side">
        <div class="route-stat">
          <p class="eyebrow">${ui2.timelineLabel}</p>
          <b>${daysLabel} <small>${ui2.days}</small></b>
          <p>${timelineNote}</p>
        </div>
        <div class="route-stat">
          <p class="eyebrow">${ui2.recommended}</p>
          <b style="font-size:22px">${pkg.price}</b>
          <p>${ui2.from} · ${pkg.name[LANG]}${priceNote}</p>
        </div>
        ${bonus}
        <div class="route-stat route-risks">
          <p class="eyebrow" style="color:var(--warn)">${ui2.risksLabel}</p>
          <ul>${risks.map((k) => `<li>${k}</li>`).join('')}</ul>
        </div>
      </div>
      <div class="route-cta">
        <div>
          <p class="eyebrow">${ui2.ctaEyebrow}</p>
          <p>${ui2.ctaTitle}</p>
        </div>
        <div class="route-cta-actions">
          <a class="cta on-gold" id="route-wa" target="_blank" rel="noopener">${ui2.ctaWa} <span>↗</span></a>
          <a class="cta ghost" id="route-form" href="#consulta" style="color:var(--paper)">${ui2.ctaForm} <span>↓</span></a>
        </div>
      </div>
      <p class="route-source">${ui2.source} · ${ui2.resultNote}</p>
    </div>`;

    const summaryText = routeSummaryText();
    const wa = body.querySelector('#route-wa');
    wa.href = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`${ui2.waIntro}\n${summaryText}`)}`;
    wa.addEventListener('click', () => track('whatsapp_click', 'route_result'));
    body.querySelector('#route-form').addEventListener('click', () => attachRouteToForm(summaryText));
    attachRouteToForm(summaryText, true);
    track('precheck_complete', `${state.country}:${pkgId}`);
  }

  function routeSummaryText() {
    const ui2 = WZ_UI[LANG];
    const { r, pkg, daysLabel } = buildRoute();
    const goals = state.goal.map((g) => ui2.goals.find((x) => x.id === g)?.b).filter(Boolean).join(' + ');
    const family = ui2.family.find((f) => f.id === state.family)?.b || '';
    const docs = ui2.docs.find((d) => d.id === state.docs)?.b || '';
    const when = ui2.timeline.find((t) => t.id === state.timeline)?.b || '';
    return [
      `${r.flag} ${r.name[LANG]} · ${ui2.resultTag[r.treaty]}`,
      `→ ${goals}`,
      `→ ${family} · ${when}`,
      `→ Docs: ${docs}`,
      `→ ${pkg.name[LANG]} (${ui2.from} ${pkg.price}) · ${daysLabel} ${ui2.days}`,
    ].join('\n');
  }

  backBtn.addEventListener('click', () => { if (step > 0) { step -= 1; render(); } });
  nextBtn.addEventListener('click', () => { if (canAdvance() && step < order.length - 1) { step += 1; render(); } });

  document.querySelectorAll('[data-route]').forEach((card) => {
    card.addEventListener('click', () => {
      state.country = card.dataset.route;
      step = 1;
      render();
      wizardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      track('route_card_click', card.dataset.route);
    });
  });

  render();
}

/* ── Formulario de consulta ────────────────────────────────── */

const form = document.querySelector('#lead-form');
const message = document.querySelector('#form-message');
const routeAttach = document.querySelector('.route-attach');
let attachedRoute = '';

function attachRouteToForm(text, silent) {
  attachedRoute = text;
  if (routeAttach) {
    routeAttach.classList.add('visible');
    if (!silent) document.querySelector('#consulta')?.scrollIntoView({ behavior: 'smooth' });
  }
}

routeAttach?.querySelector('button')?.addEventListener('click', () => {
  attachedRoute = '';
  routeAttach.classList.remove('visible');
});

const FORM_MSG = {
  es: {
    sending: 'Enviando…',
    ok: 'Gracias. Ricardo recibió tu consulta y te responderá pronto.',
    fail: 'No se pudo enviar la consulta. Intentalo de nuevo o escribinos por correo.',
    submit: 'Enviar consulta <span>↗</span>',
  },
  pt: {
    sending: 'Enviando…',
    ok: 'Obrigado! Ricardo recebeu a sua consulta e responde em breve.',
    fail: 'Não foi possível enviar a consulta. Tente de novo ou escreva por e-mail.',
    submit: 'Enviar consulta <span>↗</span>',
  },
};

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const t = FORM_MSG[LANG];
  const submit = form.querySelector('button[type="submit"]');
  const data = Object.fromEntries(new FormData(form).entries());
  data.lang = LANG;
  if (attachedRoute) data.route = attachedRoute;

  submit.disabled = true;
  submit.textContent = t.sending;
  message.textContent = '';
  message.classList.remove('ok');

  fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
    .then(async (response) => {
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || t.fail);
      message.textContent = t.ok;
      message.classList.add('ok');
      form.reset();
      track('form_submit', data.interest || '');
    })
    .catch((error) => {
      message.textContent = error.message || t.fail;
    })
    .finally(() => {
      submit.disabled = false;
      submit.innerHTML = t.submit;
    });
});

/* ── Scroll: barra de progreso + reveals ───────────────────── */

const progressBar = document.querySelector('.progress');
if (progressBar) {
  const onScroll = () => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    progressBar.style.transform = `scaleX(${max > 0 ? h.scrollTop / max : 0})`;
  };
  document.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

const revealItems = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
);
revealItems.forEach((item) => observer.observe(item));

/* ── WhatsApp tracking global ──────────────────────────────── */

document.querySelectorAll('a[href*="wa.me"]').forEach((a) => {
  a.addEventListener('click', () => track('whatsapp_click', a.dataset.waFrom || 'page'));
});

/* ── Sugerencia de idioma ──────────────────────────────────── */

(function langSuggest() {
  let dismissed = false;
  try { dismissed = !!localStorage.getItem('pw-lang-dismiss'); } catch { dismissed = false; }
  if (dismissed) return;
  const nav = (navigator.language || '').toLowerCase();
  if (LANG === 'es' && nav.startsWith('pt')) {
    showBanner('🇧🇷 Este site também está disponível em português.', 'Ver em português', '/pt/');
  } else if (LANG === 'pt' && nav.startsWith('es')) {
    showBanner('🇵🇾 Este sitio también está disponible en español.', 'Ver en español', '/');
  }

  function showBanner(text, cta, href) {
    const bar = document.createElement('div');
    bar.setAttribute('role', 'status');
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:50;background:#0B1738;color:#F2EDE0;padding:12px 20px;display:flex;gap:16px;align-items:center;justify-content:center;font:500 13px Inter,sans-serif;flex-wrap:wrap';
    bar.innerHTML = `<span>${text}</span><a href="${href}" style="color:#B8935A;text-decoration:underline;text-underline-offset:3px">${cta}</a><button aria-label="Cerrar" style="background:none;border:0;color:#F2EDE0;cursor:pointer;font-size:16px;opacity:.7">×</button>`;
    bar.querySelector('button').addEventListener('click', () => {
      try { localStorage.setItem('pw-lang-dismiss', '1'); } catch { /* storage opcional */ }
      bar.remove();
    });
    document.body.appendChild(bar);
  }
})();

initWizard();
