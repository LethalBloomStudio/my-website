import Image from "next/image";

// Shared "no cover" fallback -- reuses the platform's existing dark-box,
// title-overlaid pattern from app/discover/FeaturedCarousel.tsx (the
// manuscript-cover placeholder), rather than falling back to plain text or
// nothing at all. Book Club's own cover spots previously rendered nothing
// when cover_image_url was null.
export default function BookClubCoverThumb({
  coverUrl,
  title,
  width = 40,
  height = 56,
  className = "",
}: {
  coverUrl: string | null;
  title: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded bg-neutral-900 ${className}`}
      style={{ width, height }}
    >
      {coverUrl ? (
        <Image src={coverUrl} alt={title} fill sizes={`${width}px`} className="object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center px-1 text-center text-[8px] leading-snug text-neutral-600">
          {title}
        </div>
      )}
    </div>
  );
}
