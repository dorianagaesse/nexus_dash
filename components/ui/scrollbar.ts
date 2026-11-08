/** The app's thin scrollbar with a transparent track and muted thumb. */
export const SLIM_SCROLLBAR_CLASSES = [
  "[scrollbar-color:rgba(148,163,184,0.52)_transparent]",
  "[scrollbar-width:thin]",
  "[&::-webkit-scrollbar]:w-2",
  "[&::-webkit-scrollbar-track]:rounded-full",
  "[&::-webkit-scrollbar-track]:bg-transparent",
  "[&::-webkit-scrollbar-thumb]:rounded-full",
  "[&::-webkit-scrollbar-thumb]:bg-[rgba(148,163,184,0.52)]",
].join(" ");
