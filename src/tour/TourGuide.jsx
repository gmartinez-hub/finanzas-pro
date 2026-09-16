import React, { useEffect, useRef, useState } from 'react';
import { TOUR_STEPS, createSupabaseTourTransport, createTourController, positionTour } from './steps.js';
import './tour.css';

const INITIAL_STATE = { step: null, index: 0, mode: 'local', following: false, connection: 'offline', closed: false };

/** Nothing connects until enabled. Credentials stay in App's existing config. */
export default function TourGuide({ enabled = false, onClose, navigate, onAction, supabaseConfig, transport }) {
  const callbacks = useRef({ onClose, navigate, onAction });
  callbacks.current = { onClose, navigate, onAction };
  const controller = useRef(null);
  const panel = useRef(null);
  const [state, setState] = useState(INITIAL_STATE);
  const [position, setPosition] = useState(null);
  const [connectionWarning, setConnectionWarning] = useState(false);
  const [anchorFound, setAnchorFound] = useState(false);
  const configUrl = supabaseConfig?.url;
  const configKey = supabaseConfig?.anonKey;

  useEffect(() => {
    if (!enabled) { setState(INITIAL_STATE); return undefined; }
    let cancelled = false;
    let guide;
    setConnectionWarning(false);
    setPosition(null);
    async function start() {
      let selectedTransport = transport;
      if (transport === undefined && configUrl && configKey) {
        try {
          const { createClient } = await import('@supabase/supabase-js');
          if (cancelled) return;
          selectedTransport = createSupabaseTourTransport(createClient(configUrl, configKey, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          }));
        } catch {
          if (cancelled) return;
          setConnectionWarning(true);
        }
      }
      if (cancelled) return;
      guide = createTourController({
        enabled: true,
        transport: selectedTransport,
        navigate: route => callbacks.current.navigate?.(route),
        onAction: (action, context) => callbacks.current.onAction?.(action, context),
        onClose: () => callbacks.current.onClose?.(),
        onChange: next => { if (!cancelled) setState(next); },
      });
      controller.current = guide;
      guide.start();
    }
    void start();
    return () => { cancelled = true; guide?.stop(); controller.current = null; };
  }, [enabled, transport, configUrl, configKey]);

  useEffect(() => {
    if (!enabled || state.closed || !panel.current) return undefined;
    let highlighted;
    let animationFrame;
    let didScroll = false;
    const body = document.body;
    body.setAttribute('data-mangos-tour-open', 'true');
    const findAnchor = () => {
      if (!state.step) return null;
      for (const target of [state.step.target, ...state.step.fallbackTargets]) {
        for (const element of document.querySelectorAll(`[data-tour-target="${target}"]`)) {
          const rect = element.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < window.innerWidth && getComputedStyle(element).visibility !== 'hidden') return element;
        }
      }
      return null;
    };
    const measure = () => {
      const element = findAnchor();
      if (highlighted !== element) {
        highlighted?.classList.remove('mangos-tour-highlight');
        highlighted = element;
        highlighted?.classList.add('mangos-tour-highlight');
      }
      setAnchorFound(Boolean(element));
      if (element && !didScroll) {
        didScroll = true;
        element.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      }
      const height = panel.current?.getBoundingClientRect().height || 240;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const nextPosition = positionTour(element?.getBoundingClientRect(), viewport, { width: 360, height });
      setPosition(previous => previous && Object.keys(nextPosition).every(key => previous[key] === nextPosition[key]) ? previous : nextPosition);
      body.style.setProperty('--mangos-tour-space', `${height + 28}px`);
    };
    const schedule = () => { cancelAnimationFrame(animationFrame); animationFrame = requestAnimationFrame(measure); };
    const observer = new MutationObserver(schedule);
    observer.observe(document.querySelector('main') || body, { childList: true, subtree: true });
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (panel.current) resizeObserver?.observe(panel.current);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    schedule();
    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
      highlighted?.classList.remove('mangos-tour-highlight');
      body.removeAttribute('data-mangos-tour-open');
      body.style.removeProperty('--mangos-tour-space');
    };
  }, [enabled, state.step, state.closed]);

  if (!enabled || state.closed || (!state.step && state.mode !== 'live')) return null;
  const last = state.index === TOUR_STEPS.length - 1;
  const failedConnection = connectionWarning || state.connection === 'error';
  return (
    <aside
      ref={panel}
      className="mangos-tour"
      aria-label="Guía de Mangos"
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); controller.current?.close(); } }}
      style={position ? { top: position.top, left: position.left, right: 'auto', bottom: 'auto', width: position.width } : undefined}
    >
      <div className="mangos-tour-heading">
        <span>{state.mode === 'live' ? 'Charla en vivo' : 'Guía Mangos'}</span>
        <span className="mangos-tour-progress">{state.step ? `${state.index + 1} / ${TOUR_STEPS.length}` : 'En pausa'}</span>
        <button type="button" className="mangos-tour-close" aria-label="Cerrar guía" onClick={() => controller.current?.close()}>×</button>
      </div>
      <div className="mangos-tour-copy" aria-live="polite" aria-atomic="true">
        <h2>{state.step?.title || 'Seguí la presentación'}</h2>
        <p>{state.step?.detail || 'Esta diapositiva no necesita una acción en la app. Podés continuar con la guía por tu cuenta.'}</p>
        {state.step && !anchorFound && <p className="mangos-tour-note">La sección está abierta. Este control puede aparecer cuando agregues los datos necesarios.</p>}
      </div>
      {failedConnection && <p className="mangos-tour-note" role="status">La conexión con la charla no está disponible. Podés seguir con Anterior y Siguiente.</p>}
      <div className="mangos-tour-actions">
        {state.step && <button type="button" className="btn bl" onClick={() => controller.current?.activate()}>{state.step.label}</button>}
        <div className="mangos-tour-navigation">
          <button type="button" className="btn bg" disabled={state.index === 0} onClick={() => controller.current?.previous()}>Anterior</button>
          <button type="button" className="btn bg" onClick={() => last ? controller.current?.close() : controller.current?.next()}>{last ? 'Terminar' : 'Siguiente'}</button>
        </div>
        {!state.following && transport !== null && (transport || (configUrl && configKey)) && <button type="button" className="mangos-tour-follow" onClick={() => controller.current?.follow()}>Volver a seguir la charla</button>}
      </div>
    </aside>
  );
}
