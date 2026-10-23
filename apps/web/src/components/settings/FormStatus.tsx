/** Inline status line under a settings form: error (red) or a short confirmation. */
export function FormStatus({ error, ok }: { error?: string | null; ok?: string | null }) {
  if (error) {
    return (
      <span role="alert" className="text-[13px] text-down">
        {error}
      </span>
    );
  }
  if (ok) {
    return (
      <span role="status" className="text-[13px] text-up">
        {ok}
      </span>
    );
  }
  return null;
}

export function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}
