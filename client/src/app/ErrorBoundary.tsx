/**
 * Si una pantalla se rompe, en lugar de dejar la app en negro muestra un aviso con "Recargar" y
 * "Reportar el problema" (el error queda adjunto al reporte automáticamente).
 */
import { Component, ReactNode, useState } from 'react';
import { recordClientError } from '../lib/clientErrors';
import { ReportProblemSheet } from '../school/ReportProblem';

const CrashScreen = ({ message, onRetry }: { message: string; onRetry: () => void }) => {
  const [reporting, setReporting] = useState(false);
  return (
    <div className="page" style={{ maxWidth: 480, margin: '10vh auto', textAlign: 'center' }}>
      <div className="card stack" style={{ padding: 24 }}>
        <h1 className="h2">Algo salió mal en esta pantalla</h1>
        <p className="small muted">Probá recargar. Si vuelve a pasar, reportalo: el detalle técnico se adjunta solo.</p>
        <code className="xs muted" style={{ wordBreak: 'break-word' }}>{message}</code>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <button className="btn btn-accent" onClick={() => window.location.reload()}>Recargar</button>
          <button className="btn btn-ghost" onClick={() => setReporting(true)}>Reportar el problema</button>
        </div>
        <button className="btn btn-sm btn-ghost" onClick={onRetry}>Volver a intentar sin recargar</button>
      </div>
      <ReportProblemSheet open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
};

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    const firstComponent = info.componentStack?.trim().split('\n')[0]?.trim() ?? null;
    recordClientError(error.message, `pantalla rota ${firstComponent ?? ''} · ${window.location.pathname}`);
  }

  render() {
    if (this.state.error) return <CrashScreen message={this.state.error.message} onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
