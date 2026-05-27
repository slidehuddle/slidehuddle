import Link from "next/link";

type Props = {
  variant: "creator" | "recipient";
  deckId: string;
};

export default function SignInBanner({ variant, deckId }: Props) {
  const message =
    variant === "creator"
      ? "Sign in to save this deck to your dashboard."
      : "Sign in to comment and collaborate.";

  const nextPath =
    variant === "creator"
      ? `/viewer?id=${deckId}&source=capture`
      : `/viewer?id=${deckId}`;

  const signInHref = `/login?next=${encodeURIComponent(nextPath)}`;

  return (
    <div className="flex items-center justify-between gap-4 px-8 py-3 bg-brand/[0.06] border-b border-brand/20">
      <span className="text-sm text-foreground">{message}</span>
      <Link
        href={signInHref}
        className="inline-flex items-center rounded-lg bg-brand text-white text-sm font-semibold px-4 py-2 hover:bg-brand-hover transition-colors"
      >
        Sign in
      </Link>
    </div>
  );
}
