'use client';

import { Fragment, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AtSign,
  CalendarDays,
  Link2,
  LogOut,
  PenSquare,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { setUnauthorizedHandler } from '@/lib/api/client';
import { authApi } from '@/lib/api/resources';
import { useToast } from '@/components/ui/toast';
import { ResponsiveNav } from '@/components/shell/responsive-nav';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Dos grupos con una linea entre ellos: trabajo y redes. */
const WORK_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Calendario', icon: CalendarDays },
  { href: '/posts/new', label: 'Nuevo post', icon: PenSquare },
  { href: '/settings/brands', label: 'Marcas', icon: Tags },
];

const NETWORK_ITEMS: readonly NavItem[] = [
  { href: '/settings/meta', label: 'Meta', icon: Link2 },
  { href: '/settings/threads', label: 'Threads', icon: AtSign },
];

const GROUPS: readonly (readonly NavItem[])[] = [WORK_ITEMS, NETWORK_ITEMS];

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

  const itemClass =
    'flex items-center gap-2 rounded-md px-2.5 py-2.5 text-sm transition-colors md:py-1.5';

  return (
    <ResponsiveNav brand="Social Publisher" ariaLabel="Principal">
      {(close) => (
        <>
          <div className="flex flex-1 flex-col gap-1">
            {GROUPS.map((group, index) => (
              <Fragment key={group[0].href}>
                {index > 0 && (
                  <span
                    role="separator"
                    className="my-2 h-px w-auto shrink-0 bg-line"
                  />
                )}
                <div className="flex flex-col gap-1">
                  {group.map(({ href, label, icon: Icon }) => {
                    const active =
                      href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={close}
                        aria-current={active ? 'page' : undefined}
                        className={`${itemClass} ${
                          active
                            ? 'bg-surface-muted font-medium text-foreground'
                            : 'text-muted hover:bg-surface-muted hover:text-foreground'
                        }`}
                      >
                        <Icon className="size-4" aria-hidden />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              </Fragment>
            ))}
          </div>
          <button
            type="button"
            onClick={logout}
            className={`${itemClass} text-muted hover:bg-surface-muted hover:text-foreground`}
          >
            <LogOut className="size-4" aria-hidden />
            Salir
          </button>
        </>
      )}
    </ResponsiveNav>
  );
}
