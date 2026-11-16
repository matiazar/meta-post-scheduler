import { AppNav } from '@/components/app-nav';

export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <AppNav />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </div>
  );
}
