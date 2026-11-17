'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/field';
import {
  aiApi,
  type AiNetwork,
  type AiVariant,
} from '@/lib/api/resources';

interface Props {
  brandId: string;
  mediaIds: string[];
  network: AiNetwork;
  /** La marca no tiene descripcion ni tono: la IA escribe mas generico */
  brandHasContext: boolean;
  /** Texto actual del post: si ya hay, se ofrece reemplazar o agregar al final */
  caption: string;
  onApply: (text: string) => void;
}

/** Texto del post con los hashtags al final, listo para el campo de texto. */
export function variantToCaption(variant: AiVariant): string {
  const tags = variant.hashtags.map((tag) => `#${tag}`).join(' ');
  return tags ? `${variant.text}\n\n${tags}` : variant.text;
}

/**
 * La IA mira las imagenes del post y propone 3 textos con hashtags con la voz de la marca.
 * Solo propone: el texto del post no cambia hasta que se elige una variante.
 */
export function AiSuggest({
  brandId,
  mediaIds,
  network,
  brandHasContext,
  caption,
  onApply,
}: Props) {
  const [hint, setHint] = useState('');
  const [variants, setVariants] = useState<AiVariant[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blocked = !brandId
    ? 'Elegí una marca primero'
    : mediaIds.length === 0
      ? 'Subí al menos una imagen primero'
      : null;

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const result = await aiApi.suggestCopy({
        brandId,
        mediaIds,
        network,
        ...(hint.trim() ? { hint: hint.trim() } : {}),
      });
      setVariants(result.variants);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'No se pudo generar el texto',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-line bg-surface-muted p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label htmlFor="ai-hint" className="text-xs font-medium">
            Indicación para la IA (opcional)
          </label>
          <Input
            id="ai-hint"
            value={hint}
            maxLength={300}
            placeholder="Ej: promo de abril, tono más formal"
            onChange={(event) => setHint(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          onClick={generate}
          loading={loading}
          disabled={blocked !== null}
        >
          {!loading && <Sparkles className="size-4" aria-hidden />}
          {variants ? 'Generar otras' : 'Generar texto con IA'}
        </Button>
      </div>

      <p className="mt-1.5 text-xs text-muted" aria-live="polite">
        {loading
          ? 'Mirando las imágenes y escribiendo…'
          : (blocked ??
            (brandHasContext
              ? 'La IA lee las imágenes y la descripción y el tono de la marca.'
              : 'Tip: completá la descripción y el tono de la marca (Ajustes → Marcas) para que escriba más parecido a vos.'))}
      </p>

      {error && (
        <p
          role="alert"
          className="mt-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      )}

      {variants && (
        <ul className="mt-3 grid gap-2">
          {variants.map((variant, index) => (
            <li
              key={index}
              className="rounded-md border border-line bg-surface p-3"
            >
              <p className="whitespace-pre-line text-sm">{variant.text}</p>
              {variant.hashtags.length > 0 && (
                <p className="mt-2 break-words text-xs text-accent">
                  {variant.hashtags.map((tag) => `#${tag}`).join(' ')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onApply(variantToCaption(variant))}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  {caption.trim() ? 'Reemplazar el texto' : 'Usar este texto'}
                </button>
                {caption.trim() && (
                  <button
                    type="button"
                    onClick={() =>
                      onApply(
                        `${caption.trimEnd()}\n\n${variantToCaption(variant)}`,
                      )
                    }
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    Agregar al final
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
