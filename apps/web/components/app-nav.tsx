'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Link2, LogOut, PenSquare, Tags } from 'lucide-react';
import { setUnauthorizedHandler } from '@/lib/api/client';
import { authApi } from '@/lib/api/resources';
import { useToast } from '@/components/ui/toast';

const ITEMS = [
  { href: '/', label: 'Calendario', icon: CalendarDays },
  { href: '/posts/new', label: 'Nuevo post', icon: PenSquare },
  { href: '/settings/brands', label: 'Marcas', icon: Tags },
  { href: '/settings/meta', label: 'Meta', icon: Link2 },
] as const;

export function AppNav() {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    // Sesion vencida en cualquier llamada: se vuelve al login
    setUnauthorizedHandler(() => router.replace('/login'));
    return () => setUnauthorizedHandler(null);
  }, [router]);

  async function logout() {
    try {
      await authApi.logout();
      router.replace('/login');
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'No se pudo cerrar la sesión',
      );
    }
  }

  return (
    <nav
      aria-label="Principal"
      className="flex shrink-0 items-center gap-1 border-b border-line bg-surface px-3 py-2 md:w-56 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-3 md:py-4"
    >
      <span className="mr-2 px-2 text-sm font-semibold md:mb-4 md:mr-0">
        Social Publisher
      </span>
      <div className="flex flex-1 gap-1 md:flex-col">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active =
            href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-surface-muted font-medium text-foreground'
                  : 'text-muted hover:bg-surface-muted hover:text-foreground'
              }`}
            >
              <Icon className="size-4" aria-hidden />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label}</span>
            </Link>
          );
        })}
      </div>
      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <LogOut className="size-4" aria-hidden />
        Salir
      </button>
    </nav>
  );
}
