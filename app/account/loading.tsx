export default function AccountLoading() {
  return (
    <section
      aria-labelledby="user-hub-loading-heading"
      aria-busy="true"
      className="space-y-5"
    >
      <div className="space-y-2">
        <div className="h-7 w-40 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div className="h-4 w-72 max-w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-48 animate-pulse rounded-xl border border-border/70 bg-muted/40 motion-reduce:animate-none" />
      <h1 id="user-hub-loading-heading" className="sr-only">
        Loading user hub
      </h1>
      <p className="sr-only" role="status">
        Loading your account information.
      </p>
    </section>
  );
}
