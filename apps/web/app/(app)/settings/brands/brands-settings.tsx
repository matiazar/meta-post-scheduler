'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import {
  accountsApi,
  brandsApi,
  type Brand,
  type Network,
  type SocialAccount,
} from '@/lib/api/resources';
import { NETWORKS, NETWORK_LABEL } from '@/lib/networks';
import { useApiData } from '@/lib/use-api-data';
import { BrandForm } from './brand-form';

function Skeleton() {
  return (
    <div className="mt-6 h-32 animate-pulse rounded-lg bg-surface-muted" />
  );
}

function LoadError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="mt-6 rounded-lg bg-danger-soft p-4 text-sm text-danger"
    >
      {message}
      <div className="mt-3">
        <Button variant="secondary" onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    </div>
  );
}

type Editing = { mode: 'create' } | { mode: 'edit'; brand: Brand } | null;

export function BrandsSettings() {
  const toast = useToast();
  const brands = useApiData(brandsApi.list);
  const accounts = useApiData(accountsApi.list);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<Brand | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [network, setNetwork] = useState<Network | null>(null);

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await brandsApi.remove(toDelete.id);
      toast.success(`Marca "${toDelete.name}" eliminada`);
      setToDelete(null);
      await Promise.all([brands.refresh(), accounts.refresh()]);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'No se pudo eliminar la marca',
      );
      setToDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  async function assign(account: SocialAccount, brandId: string) {
    try {
      await accountsApi.assignBrand(
        account.id,
        brandId === '' ? null : brandId,
      );
      await accounts.refresh();
      toast.success('Cuenta actualizada');
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : 'No se pudo asignar la cuenta',
      );
    }
  }

  if (brands.loading || accounts.loading) return <Skeleton />;
  if (brands.error || !brands.data) {
    return (
      <LoadError
        message={brands.error ?? 'No se pudieron cargar las marcas'}
        onRetry={() => void brands.refresh()}
      />
    );
  }
  if (accounts.error || !accounts.data) {
    return (
      <LoadError
        message={accounts.error ?? 'No se pudieron cargar las cuentas'}
        onRetry={() => void accounts.refresh()}
      />
    );
  }

  const brandList = brands.data;
  const accountList = accounts.data;
  // Una pestaña por cada red que tiene cuentas; si la elegida ya no existe, la primera
  const networkTabs = NETWORKS.filter((n) =>
    accountList.some((a) => a.network === n),
  );
  const activeNetwork =
    network && networkTabs.includes(network) ? network : networkTabs[0];
  const visibleAccounts = accountList.filter(
    (a) => a.network === activeNetwork,
  );

  return (
    <>
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tus marcas</h2>
        {!editing && (
          <Button onClick={() => setEditing({ mode: 'create' })}>
            <Plus className="size-4" aria-hidden />
            Nueva marca
          </Button>
        )}
      </div>

      {editing && (
        <BrandForm
          key={editing.mode === 'edit' ? editing.brand.id : 'new'}
          brand={editing.mode === 'edit' ? editing.brand : undefined}
          onCancel={() => setEditing(null)}
          onSaved={async (name, created) => {
            setEditing(null);
            toast.success(
              created ? `Marca "${name}" creada` : `Marca "${name}" guardada`,
            );
            await brands.refresh();
          }}
        />
      )}

      {brandList.length === 0 && !editing ? (
        <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
          Todavía no tenés marcas. Creá la primera para poder agrupar tus
          cuentas y armar posts.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {brandList.map((brand) => {
            const own = accountList.filter((a) => a.brandId === brand.id);
            return (
              <li
                key={brand.id}
                className="flex items-start gap-3 rounded-lg border border-line bg-surface p-4"
              >
                <span
                  className="mt-1 size-4 shrink-0 rounded-full"
                  style={{ backgroundColor: brand.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{brand.name}</span>
                    {!brand.active && <Badge>Inactiva</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {own.length === 0
                      ? 'Sin cuentas asignadas'
                      : own
                          .map((a) => `${NETWORK_LABEL[a.network]}: ${a.name}`)
                          .join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="ghost"
                    aria-label={`Editar ${brand.name}`}
                    onClick={() => setEditing({ mode: 'edit', brand })}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`Eliminar ${brand.name}`}
                    onClick={() => setToDelete(brand)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-10 text-sm font-semibold">Cuentas sociales</h2>
      {accountList.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">
          No hay cuentas todavía. Conectá Meta y sincronizá desde Ajustes &gt;
          Meta para traer tus Páginas e Instagram.
        </p>
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Cuentas por red"
            className="mt-3 flex gap-1 overflow-x-auto border-b border-line"
          >
            {networkTabs.map((n) => {
              const selected = n === activeNetwork;
              const count = accountList.filter((a) => a.network === n).length;
              return (
                <button
                  key={n}
                  id={`tab-${n}`}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls="accounts-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setNetwork(n)}
                  onKeyDown={(event) => {
                    const step =
                      event.key === 'ArrowRight'
                        ? 1
                        : event.key === 'ArrowLeft'
                          ? -1
                          : 0;
                    if (step === 0) return;
                    event.preventDefault();
                    const next =
                      networkTabs[
                        (networkTabs.indexOf(n) + step + networkTabs.length) %
                          networkTabs.length
                      ];
                    setNetwork(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }}
                  className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
                    selected
                      ? 'border-accent font-medium text-foreground'
                      : 'border-transparent text-muted hover:text-foreground'
                  }`}
                >
                  {NETWORK_LABEL[n]}
                  <span className="ml-1.5 text-xs text-muted">{count}</span>
                </button>
              );
            })}
          </div>
          <ul
            id="accounts-panel"
            role="tabpanel"
            aria-labelledby={`tab-${activeNetwork}`}
            className="mt-3 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface"
          >
            {visibleAccounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center gap-3 p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{account.name}</span>
                    {!account.active && <Badge>Desactivada</Badge>}
                  </div>
                  {account.username && (
                    <p className="text-xs text-muted">@{account.username}</p>
                  )}
                </div>
                <Select
                  aria-label={`Marca de ${account.name}`}
                  className="sm:w-48"
                  value={account.brandId ?? ''}
                  onChange={(event) => void assign(account, event.target.value)}
                >
                  <option value="">Sin marca</option>
                  {brandList.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title={`¿Eliminar "${toDelete?.name ?? ''}"?`}
        description="Sus cuentas quedan sin marca. Si la marca ya tiene posts no se puede eliminar: desactivala en su lugar."
        confirmLabel="Eliminar marca"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}
