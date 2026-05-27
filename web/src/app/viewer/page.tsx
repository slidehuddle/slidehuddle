import SlideViewer from "./SlideViewer";
import ShareBar from "./ShareBar";
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
      {source === "stored" && <ShareBar />}
      {source === "sample" && (
        <div className="px-8 py-2 text-xs text-muted border-b border-border">
          Viewing sample deck
        </div>
      )}
      <SlideViewer rawHtml={html} />
    </main>
  );
}
