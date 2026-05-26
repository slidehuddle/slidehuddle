import Link from "next/link";
import SlideViewer from "./SlideViewer";
import { SAMPLE_SLIDES_HTML } from "@/lib/sample-slides";
import { getStoredSlides } from "@/lib/slide-store";

export default async function ViewerPage({
  searchParams,
}: {
  searchParams: Promise<{
    slides?: string;
    id?: string;
  }>;
}) {
  const { slides, id } = await searchParams;

  let html: string;
  let source: "param" | "stored" | "sample";

  if (slides) {
    html = slides;
    source = "param";
  } else if (id) {
    html = (await getStoredSlides(id)) ?? "";
    source = "stored";
  } else {
    html = SAMPLE_SLIDES_HTML;
    source = "sample";
  }

  return (
    <main className="flex-1 flex flex-col">
      <header className="flex items-center justify-between px-8 py-5 border-b border-border">
        <Link href="/" className="flex items-center gap-2 text-brand font-semibold">
          <span className="inline-block h-6 w-6 rounded-md bg-brand" />
          SlideHuddle
        </Link>
        {source === "sample" && (
          <span className="text-xs text-muted">Viewing sample deck</span>
        )}
      </header>

      <SlideViewer rawHtml={html} />
    </main>
  );
}
