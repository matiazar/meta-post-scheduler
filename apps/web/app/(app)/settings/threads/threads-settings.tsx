'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { threadsApi } from '@/lib/api/resources';
import { useApiData } from '@/lib/use-api-data';

const RETURN_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: {
    ok: true,
    text: 'Threads quedó conectado. Ya podés asignar el perfil a una marca en Marcas.',
  },
  denied: {
    ok: false,
    text: 'Cancelaste la conexión. Cuando quieras, volvé a intentarlo.',
  },
  error: {
    ok: false,
    text: 'No se pudo completar la conexión. Intentá de nuevo; si sigue fallando, revisá que tu usuario sea evaluador de Threads en la app de Meta.',
  },
};

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Tucuman',
});

export function ThreadsSettings() {
  const toast = useToast();
  const returned = useSearchParams().get('status');
  const banner = returned ? RETURN_MESSAGES[returned] : undefined;
  const { data, error, loading, refresh } = useApiData(threadsApi.status);
  const [connecting, setConnecting] = useState(false);

  async function connect() {
    setConnecting(true);
    try {
      const { url } = await threadsApi.connectUrl();
      window.location.assign(url);
    } catch (e) {
      setConnecting(false);
      toast.error(
        e instanceof Error ? e.message : 'No se pudo iniciar la conexión',
      );
    }
  }

  if (loading) {
    return (
      <div className="mt-6 h-40 animate-pulse rounded-lg bg-surface-muted" />
    );
  }
  if (error || !data) {
    return (
      <div
        role="alert"
        className="mt-6 rounded-lg bg-danger-soft p-4 text-sm text-danger"
      >
        {error ?? 'No se pudo cargar el estado de la conexión'}
        <div className="mt-3">
          <Button variant="secondary" onClick={() => void refresh()}>
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      {banner && (
        <div
          role="status"
          className={`mt-6 flex items-start gap-2 rounded-lg px-3.5 py-3 text-sm ${
            banner.ok
              ? 'bg-success-soft text-success'
              : 'bg-warning-soft text-warning'
          }`}
        >
          {banner.ok ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {banner.text}
        </div>
      )}

      {!data.configured && (
        <p
          role="status"
          className="mt-6 rounded-lg bg-warning-soft px-3.5 py-3 text-sm text-warning"
        >
          Threads todavía no está configurado en el servidor: faltan
          THREADS_APP_ID, THREADS_APP_SECRET y THREADS_REDIRECT_URI en el .env
          de la API.
        </p>
      )}

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold">Perfiles conectados</h2>
        {data.connections.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Todavía no conectaste ningún perfil.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line text-sm">
            {data.connections.map((connection) => (
              <li
                key={connection.username}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <span className="font-medium">@{connection.username}</span>
                <span className="flex items-center gap-3">
                  {connection.tokenExpiresAt && (
                    <span className="text-xs text-muted">
                      Acceso vence{' '}
                      {dateFormat.format(new Date(connection.tokenExpiresAt))}
                    </span>
                  )}
                  {connection.status === 'INVALID' ? (
                    <Badge tone="danger">Hay que reconectar</Badge>
                  ) : (
                    <Badge tone="success">Conectado</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">
          El acceso se renueva solo mientras la app esté funcionando. Si un
          perfil pasa a &quot;Hay que reconectar&quot;, conectalo de nuevo con
          el mismo botón.
        </p>
        <div className="mt-4">
          <Button
            onClick={connect}
            loading={connecting}
            disabled={!data.configured}
          >
            {data.connections.length > 0
              ? 'Conectar otro perfil o reconectar'
              : 'Conectar con Threads'}
          </Button>
        </div>
      </section>
    </>
  );
}
