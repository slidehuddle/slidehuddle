import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-xl w-full text-center flex flex-col items-center gap-8">
        <div className="flex items-center gap-3">
          <span className="inline-block h-10 w-10 rounded-xl bg-brand" />
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            SlideHuddle
          </h1>
        </div>

        <p className="text-lg text-muted leading-relaxed">
          Collaborate on Claude-generated slide decks.
          <br />
          Capture with the Chrome extension, share with your team.
        </p>

        <Link
          href="/viewer"
          className="inline-flex items-center justify-center rounded-xl bg-brand text-white font-semibold px-6 py-3 hover:bg-brand-hover transition-colors"
        >
          View sample deck
        </Link>
      </div>
    </main>
  );
}
