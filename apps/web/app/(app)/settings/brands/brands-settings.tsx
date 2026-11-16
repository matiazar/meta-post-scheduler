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
  type SocialAccount,
} from '@/lib/api/resources';
import { useApiData } from '@/lib/use-api-data';
import { BrandForm } from './brand-form';

const NETWORK_LABEL = { FACEBOOK: 'Facebook', INSTAGRAM: 'Instagram' } as const;

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
        <ul className="mt-3 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface">
          {accountList.map((account) => (
            <li
              key={account.id}
              className="flex flex-wrap items-center gap-3 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{account.name}</span>
                  <Badge
                    tone={account.network === 'FACEBOOK' ? 'info' : 'orange'}
                  >
                    {NETWORK_LABEL[account.network]}
                  </Badge>
                  {!account.active && <Badge>Desactivada</Badge>}
                </div>
                {account.username && (
                  <p className="text-xs text-muted">@{account.username}</p>
                )}
              </div>
              <Select
                aria-label={`Marca de ${account.name}`}
                className="w-48"
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
