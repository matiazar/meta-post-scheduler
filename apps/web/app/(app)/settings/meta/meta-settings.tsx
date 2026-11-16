'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { metaApi } from '@/lib/api/resources';
import { useApiData } from '@/lib/use-api-data';

const RETURN_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  ok: {
    ok: true,
    text: 'Meta quedó conectado. Ya podés asignar las cuentas a una marca.',
  },
  permissions: {
    ok: false,
    text: 'Meta se conectó, pero faltan permisos. Volvé a conectar y aceptá todos los permisos que pide.',
  },
  denied: {
    ok: false,
    text: 'Cancelaste la conexión. Cuando quieras, volvé a intentarlo.',
  },
  error: {
    ok: false,
    text: 'No se pudo completar la conexión. Intentá de nuevo; si sigue fallando, revisá los datos de la app de Meta.',
  },
};

const dateFormat = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Tucuman',
});

function formatDate(value: string | null): string {
  return value ? dateFormat.format(new Date(value)) : 'Nunca';
}

export function MetaSettings() {
  const toast = useToast();
  const returned = useSearchParams().get('status');
  const banner = returned ? RETURN_MESSAGES[returned] : undefined;
  const { data, error, loading, refresh } = useApiData(metaApi.status);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function connect() {
    setConnecting(true);
    try {
      const { url } = await metaApi.connectUrl();
      window.location.assign(url);
    } catch (e) {
      setConnecting(false);
      toast.error(
        e instanceof Error ? e.message : 'No se pudo iniciar la conexión',
      );
    }
  }

  async function sync() {
    setSyncing(true);
    try {
      const result = await metaApi.sync();
      await refresh();
      if (result.missingPermissions.length > 0) {
        toast.error(
          `Faltan permisos en Meta: ${result.missingPermissions.join(', ')}. Reconectá y aceptalos`,
        );
      } else {
        toast.success(
          `Sincronizado: ${result.facebook} Páginas y ${result.instagram} cuentas de Instagram`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo sincronizar');
    } finally {
      setSyncing(false);
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

  const invalid = data.status === 'INVALID';

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

      <section className="mt-6 rounded-lg border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Estado</h2>
          {!data.connected ? (
            <Badge>Sin conectar</Badge>
          ) : invalid ? (
            <Badge tone="danger">Hay que reconectar</Badge>
          ) : (
            <Badge tone="success">Conectado</Badge>
          )}
        </div>

        {invalid && (
          <p className="mt-3 text-sm text-danger">
            Meta rechazó el acceso, así que no se puede publicar. Reconectá para
            retomar las publicaciones.
          </p>
        )}

        {data.connected && (
          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted">Cuenta de Facebook</dt>
            <dd>{data.fbUserName ?? '—'}</dd>
            <dt className="text-muted">Acceso vence</dt>
            <dd>{formatDate(data.tokenExpiresAt)}</dd>
            <dt className="text-muted">Última sincronización</dt>
            <dd>{formatDate(data.lastSyncedAt)}</dd>
          </dl>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <Button onClick={connect} loading={connecting}>
            {data.connected
              ? 'Reconectar con Facebook'
              : 'Conectar con Facebook'}
          </Button>
          {data.connected && !invalid && (
            <Button variant="secondary" onClick={sync} loading={syncing}>
              Sincronizar cuentas
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
