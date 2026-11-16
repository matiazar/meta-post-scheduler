'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field, Input, describedBy } from '@/components/ui/field';
import { authApi } from '@/lib/api/resources';
import { loginSchema, type LoginValues } from '@/lib/validations/forms';

export function LoginForm() {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await authApi.login(values.email, values.password);
      router.replace('/');
      router.refresh();
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : 'No se pudo iniciar sesión',
      );
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy('email', errors.email?.message)}
          {...register('email')}
        />
      </Field>
      <Field
        label="Contraseña"
        htmlFor="password"
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? true : undefined}
          aria-describedby={describedBy('password', errors.password?.message)}
          {...register('password')}
        />
      </Field>
      {serverError && (
        <p
          role="alert"
          className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {serverError}
        </p>
      )}
      <Button type="submit" loading={isSubmitting}>
        Ingresar
      </Button>
    </form>
  );
}
