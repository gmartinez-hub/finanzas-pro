// Public presentation protocol: retain these slide indexes while the app evolves.
export const TOUR_STEPS = Object.freeze([
  { slide: 4, id: 'new-goal', route: 'goals', target: 'new-goal-btn', title: 'Dale forma a una meta', detail: 'Elegí un nombre, un monto y un plazo. Abrir el formulario no guarda una meta.', action: 'goals:new', label: 'Crear meta' },
  { slide: 6, id: 'saving-plan', route: 'dashboard', target: 'plan-ahorro-card', fallbackTargets: ['kpi-balance'], title: 'Tu meta, paso a paso', detail: 'Revisá el objetivo, lo reservado y los pagos realizados por separado. Si todavía no tenés una meta, el resumen te permite crear la primera.', label: 'Ver tu meta' },
  { slide: 8, id: 'balance', route: 'dashboard', target: 'kpi-balance', title: 'Entendé el resultado del mes', detail: 'Ingresos, gastos y reservas explican este importe. Es el resultado de lo registrado; no presupone el saldo real de tus cuentas.', label: 'Ver resultado' },
  { slide: 9, id: 'budgets', route: 'transactions', target: 'presupuestos-btn', title: 'Poné un límite por categoría', detail: 'Los presupuestos comparan tus gastos registrados con el límite que elegís.', action: 'transactions:budgets', label: 'Ver presupuestos' },
  { slide: 10, id: 'recurring', route: 'transactions', target: 'recurrentes-btn', title: 'Separá pendiente de pagado', detail: 'Revisá tus recurrentes y confirmá cada pago cuando ocurra. La guía no registra pagos.', action: 'transactions:recurring', label: 'Ver recurrentes' },
  { slide: 11, id: 'import', route: 'import', target: 'import-csv-tab', title: 'Traé tus movimientos', detail: 'Elegí un CSV y revisá las filas antes de importarlas. Podés usar también las otras opciones disponibles.', enterAction: 'import:csv', label: 'Ver importación' },
  { slide: 12, id: 'changes', route: 'dashboard', target: 'generar-resumen', fallbackTargets: ['kpi-balance'], title: 'Mirá qué cambió', detail: 'Compará períodos equivalentes y abrí los movimientos que explican cada variación. Esta vista se calcula con tus registros.', enterAction: 'overview:changes', label: 'Ver cambios' },
  { slide: 18, id: 'holdings', route: 'investments', target: 'add-holding-btn', title: 'Registrá tus inversiones', detail: 'Agregá tus tenencias con su moneda, costo y cantidad para poder seguirlas.', enterAction: 'investments:portfolio', action: 'investments:new', label: 'Agregar inversión' },
  { slide: 19, id: 'currency', route: 'dashboard', target: 'toggle-usd', fallbackTargets: ['kpi-balance'], title: 'La misma información en USD', detail: 'Importes y gráficos usan la misma cotización de referencia. Cambiar la vista no modifica los movimientos originales.', enterAction: 'currency:USD', label: 'Ver en USD' },
  { slide: 20, id: 'goal-investment', route: 'goals', target: 'vincular-inv-btn', fallbackTargets: ['new-goal-btn'], title: 'Conectá tu meta con una inversión', detail: 'Si ya tenés una meta y una inversión, podés vincularlas. Si todavía no, empezá por crear una meta y registrar la tenencia.', action: 'goals:link', label: 'Ver vínculo' },
  { slide: 21, id: 'health', enterAction: 'overview:health', route: 'dashboard', target: 'score-card', fallbackTargets: ['kpi-balance'], title: 'Revisá la cobertura de tus datos', detail: 'La salud financiera muestra sus criterios y límites. Cuando faltan registros, vas a ver datos insuficientes.', label: 'Ver salud financiera' },
  { slide: 23, id: 'closing', route: 'dashboard', target: 'kpi-balance', title: 'Tu próximo paso', detail: 'Volvé al resumen y elegí una acción concreta: registrar un movimiento, revisar un pago pendiente o avanzar con tu meta.', label: 'Volver al resumen' },
].map(step => Object.freeze({ ...step, fallbackTargets: Object.freeze(step.fallbackTargets || []) })));

export function resolveLegacySlide(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+$/.test(value))) return null;
  const slide = Number(value);
  return TOUR_STEPS.find(step => step.slide === slide) || null;
}

const validRow = row => row?.id === 'live' && typeof row.active === 'boolean'
  && ((typeof row.slide === 'number' && Number.isInteger(row.slide) && row.slide >= 0)
    || (typeof row.slide === 'string' && /^\d+$/.test(row.slide)));

/** Controller owns no DOM/storage and writes nothing to Supabase. */
export function createTourController({ enabled = false, transport, navigate = () => {}, onAction = () => {}, onClose = () => {}, onChange = () => {} } = {}) {
  let running = false;
  let unsubscribe;
  let readId = 0;
  let updateRevision = 0;
  let localIndex = 0;
  let state = { step: null, index: 0, mode: 'local', following: Boolean(transport), connection: transport ? 'connecting' : 'offline', closed: false };

  const publish = patch => { state = { ...state, ...patch }; onChange(state); };
  const applyStep = (step, mode) => {
    const changed = state.step !== step || state.mode !== mode;
    publish({ step, mode, index: step ? TOUR_STEPS.indexOf(step) : state.index });
    if (step && changed) {
      navigate(step.route);
      if (step.enterAction) onAction(step.enterAction, { stepId: step.id, source: 'enter' });
    }
  };
  const applyRow = row => {
    if (!running || !state.following || !validRow(row)) return;
    if (row.active) applyStep(resolveLegacySlide(row.slide), 'live');
    else applyStep(TOUR_STEPS[localIndex], 'local');
  };
  const read = async () => {
    if (!running || !transport) return;
    const request = ++readId;
    const revision = updateRevision;
    try {
      const row = await transport.read();
      if (running && request === readId && revision === updateRevision) applyRow(row);
    } catch {
      if (running && request === readId) publish({ connection: 'error' });
    }
  };
  const stop = () => {
    running = false;
    readId++;
    if (unsubscribe) { unsubscribe(); unsubscribe = undefined; }
  };
  const close = () => {
    if (state.closed) return;
    stop();
    publish({ closed: true, step: null });
    onClose();
  };
  const move = amount => {
    if (!running) return;
    const currentIndex = state.step ? TOUR_STEPS.indexOf(state.step) : localIndex;
    localIndex = Math.max(0, Math.min(TOUR_STEPS.length - 1, currentIndex + amount));
    publish({ following: false });
    applyStep(TOUR_STEPS[localIndex], 'local');
  };
  return {
    getState: () => state,
    start() {
      if (!enabled || running || state.closed) return;
      running = true;
      applyStep(TOUR_STEPS[localIndex], 'local');
      if (!transport) return;
      try {
        unsubscribe = transport.subscribe({
          onRow(row) {
            if (!running || !validRow(row)) return;
            updateRevision++;
            applyRow(row);
          },
          onStatus(status) {
            if (!running) return;
            if (status === 'SUBSCRIBED') {
              publish({ connection: 'connected' });
              void read(); // Also bridges the initial read/subscribe gap.
            } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) publish({ connection: 'error' });
          },
        });
      } catch { publish({ connection: 'error' }); }
      void read();
    },
    stop,
    close,
    next: () => move(1),
    previous: () => move(-1),
    follow() {
      if (!running || !transport) return;
      publish({ following: true });
      void read();
    },
    activate() {
      if (!running || !state.step) return;
      const step = state.step;
      navigate(step.route);
      const action = step.action || step.enterAction;
      if (action) onAction(action, { stepId: step.id, source: 'button' });
    },
  };
}

export function createSupabaseTourTransport(client) {
  return {
    async read() {
      const { data, error } = await client.from('charla_state').select('id,slide,active').eq('id', 'live').maybeSingle();
      if (error) throw error;
      return data;
    },
    subscribe({ onRow, onStatus }) {
      let active = true;
      const channel = client.channel('mangos-charla-live').on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'charla_state', filter: 'id=eq.live',
      }, payload => { if (active && payload.new?.id === 'live') onRow(payload.new); }).subscribe(status => { if (active) onStatus(status); });
      return () => {
        if (!active) return;
        active = false;
        Promise.resolve(client.removeChannel(channel)).catch(() => {});
      };
    },
  };
}

export function positionTour(rect, viewport, size = { width: 340, height: 230 }) {
  const gutter = 12;
  const width = Math.max(0, Math.min(size.width, viewport.width - gutter * 2));
  const height = Math.max(0, Math.min(size.height, viewport.height - gutter * 2));
  const clamp = (value, max) => Math.max(gutter, Math.min(value, max - gutter));
  const visible = rect && rect.bottom > 0 && rect.top < viewport.height && rect.right > 0 && rect.left < viewport.width;
  if (viewport.width <= 768 || !visible) return { left: viewport.width - width - gutter, top: viewport.height - height - gutter, width, height };
  const below = rect.bottom + gutter;
  const top = below + height < viewport.height - gutter ? below : rect.top - height - gutter;
  return { left: clamp(rect.left, viewport.width - width), top: clamp(top, viewport.height - height), width, height };
}
