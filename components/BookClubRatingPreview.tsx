// Shown next to the winning book on the active-cycle page -- always a
// non-interactive preview, since actual rating (book_club_submit_rating)
// only works once the cycle is status='completed', and this page 404s the
// moment a cycle reaches that status (see the closing-mechanics RLS
// lockout). Real rating submission happens on the closed-month card on
// the main /book-club page (BookClubRatingPrompt) -- this is purely "here's
// what's coming and when," not a second entry point into the same action.
export default function BookClubRatingPreview({ opensAtLabel }: { opensAtLabel: string | null }) {
  return (
    <div className="shrink-0 text-right space-y-1">
      <p className="text-[10px] uppercase tracking-wide text-neutral-600">Rate this book</p>
      <div className="flex items-center justify-end gap-0.5" title={opensAtLabel ? `Opens ${opensAtLabel}` : undefined}>
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className="text-lg leading-none text-neutral-700">★</span>
        ))}
      </div>
      {opensAtLabel && <p className="text-[10px] text-neutral-600">Opens {opensAtLabel}</p>}
    </div>
  );
}
