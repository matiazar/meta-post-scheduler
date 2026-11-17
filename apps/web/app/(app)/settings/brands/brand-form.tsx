'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, describedBy } from '@/components/ui/field';
import { brandsApi, type Brand, type BrandInput } from '@/lib/api/resources';
import { brandSchema, type BrandValues } from '@/lib/validations/forms';

interface Props {
  brand?: Brand;
  onCancel: () => void;
  onSaved: (name: string, created: boolean) => void | Promise<void>;
}

export function BrandForm({ brand, onCancel, onSaved }: Props) {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BrandValues>({
    resolver: zodResolver(brandSchema),
    defaultValues: {
      name: brand?.name ?? '',
      slug: brand?.slug ?? '',
      color: brand?.color ?? '#6366f1',
      defaultHashtags: brand?.defaultHashtags ?? '',
      signature: brand?.signature ?? '',
      description: brand?.description ?? '',
      tone: brand?.tone ?? '',
      active: brand?.active ?? true,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    // El slug vacio se omite: la API lo genera a partir del nombre
    const { slug, ...rest } = values;
    const input: BrandInput = slug === '' ? rest : { ...rest, slug };
    try {
      if (brand) await brandsApi.update(brand.id, input);
      else await brandsApi.create(input);
      await onSaved(values.name, !brand);
    } catch (error) {
      setServerError(
        error instanceof Error ? error.message : 'No se pudo guardar la marca',
      );
    }
  });

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="mt-3 grid gap-4 rounded-lg border border-line bg-surface p-5 sm:grid-cols-2"
    >
      <h3 className="text-sm font-semibold sm:col-span-2">
        {brand ? `Editar ${brand.name}` : 'Nueva marca'}
      </h3>

      <Field label="Nombre" htmlFor="name" error={errors.name?.message}>
        <Input
          id="name"
          autoFocus
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={describedBy('name', errors.name?.message)}
          {...register('name')}
        />
      </Field>

      <Field
        label="Color en el calendario"
        htmlFor="color"
        error={errors.color?.message}
      >
        <Input
          id="color"
          type="color"
          className="p-1"
          aria-describedby={describedBy('color', errors.color?.message)}
          {...register('color')}
        />
      </Field>

      <Field
        label="Identificador (opcional)"
        htmlFor="slug"
        error={errors.slug?.message}
        hint="Si lo dejás vacío se arma con el nombre"
      >
        <Input
          id="slug"
          aria-invalid={errors.slug ? true : undefined}
          aria-describedby={describedBy('slug', errors.slug?.message, 'hint')}
          {...register('slug')}
        />
      </Field>

      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input
          type="checkbox"
          className="size-4 accent-[var(--accent)]"
          {...register('active')}
        />
        Marca activa
      </label>

      <div className="sm:col-span-2">
        <Field
          label="Descripción de la marca"
          htmlFor="description"
          error={errors.description?.message}
          hint="Qué hace la marca y a quién le habla. La IA lo lee para escribir los textos de los posts"
        >
          <Textarea
            id="description"
            rows={3}
            aria-invalid={errors.description ? true : undefined}
            aria-describedby={describedBy(
              'description',
              errors.description?.message,
              'hint',
            )}
            {...register('description')}
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field
          label="Tono de voz"
          htmlFor="tone"
          error={errors.tone?.message}
          hint="Ej: cercano, sin emojis, con humor suave"
        >
          <Input
            id="tone"
            aria-invalid={errors.tone ? true : undefined}
            aria-describedby={describedBy('tone', errors.tone?.message, 'hint')}
            {...register('tone')}
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field
          label="Hashtags por defecto"
          htmlFor="defaultHashtags"
          error={errors.defaultHashtags?.message}
          hint="Se sugieren al armar un post de esta marca"
        >
          <Textarea
            id="defaultHashtags"
            aria-describedby={describedBy(
              'defaultHashtags',
              errors.defaultHashtags?.message,
              'hint',
            )}
            {...register('defaultHashtags')}
          />
        </Field>
      </div>

      <div className="sm:col-span-2">
        <Field
          label="Firma"
          htmlFor="signature"
          error={errors.signature?.message}
          hint="Texto que se agrega al final de los posts de esta marca"
        >
          <Textarea
            id="signature"
            aria-describedby={describedBy(
              'signature',
              errors.signature?.message,
              'hint',
            )}
            {...register('signature')}
          />
        </Field>
      </div>

      {serverError && (
        <p
          role="alert"
          className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger sm:col-span-2"
        >
          {serverError}
        </p>
      )}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" loading={isSubmitting}>
          Guardar marca
        </Button>
      </div>
    </form>
  );
}
