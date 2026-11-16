import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Iniciar sesión' };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold">Social Publisher</h1>
        <p className="mt-1 text-sm text-muted">
          Ingresá para programar y publicar tus posts.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
