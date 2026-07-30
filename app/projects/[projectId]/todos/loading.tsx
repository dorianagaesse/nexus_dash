export default function ProjectTodosLoading() {
  return (
    <main className="container py-6 sm:py-10" aria-busy="true">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <div className="space-y-3">
          <div className="h-11 w-32 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="h-6 w-28 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
          <div className="h-9 w-64 max-w-full animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="h-5 w-full max-w-xl animate-pulse rounded bg-muted motion-reduce:animate-none" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
          <div className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
          <div className="h-24 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-muted motion-reduce:animate-none" />
      </div>
      <span className="sr-only">Loading project todos</span>
    </main>
  );
}
