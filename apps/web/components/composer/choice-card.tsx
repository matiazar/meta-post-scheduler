import type { InputHTMLAttributes, ReactNode, Ref } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** react-hook-form pasa el ref en el spread de `register` */
  ref?: Ref<HTMLInputElement>;
  title: string;
  description?: string;
  icon?: ReactNode;
}

/** Opcion de un grupo de radios con aspecto de tarjeta. El radio nativo da teclado y lector de pantalla. */
export function ChoiceCard({ title, description, icon, ...input }: Props) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-surface p-3 text-sm transition-colors hover:bg-surface-muted has-[:checked]:border-accent has-[:checked]:bg-info-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">
      <input type="radio" className="sr-only" {...input} />
      {icon}
      <span>
        <span className="block font-medium">{title}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-muted">{description}</span>
        )}
      </span>
    </label>
  );
}
