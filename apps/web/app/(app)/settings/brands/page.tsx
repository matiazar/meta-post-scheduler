import type { Metadata } from 'next';
import { BrandsSettings } from './brands-settings';

export const metadata: Metadata = { title: 'Marcas' };

export default function BrandsSettingsPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-xl font-semibold">Marcas</h1>
      <p className="mt-1 text-sm text-muted">
        Cada marca agrupa sus cuentas de Facebook e Instagram y define su color
        en el calendario.
      </p>
      <BrandsSettings />
    </div>
  );
}
