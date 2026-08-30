// 0-5 star display, filled by the average of all end-of-month ratings for
// a cycle. No ratings yet -> empty stars with a "not reviewed" tooltip,
// rather than looking like a genuine (and misleadingly low) 0-star score.
export default function BookClubStarRating({
  ratingCount,
  averageRating,
}: {
  ratingCount: number;
  averageRating: number | null;
}) {
  const filled = ratingCount > 0 && averageRating !== null ? Math.round(averageRating) : 0;
  const tooltip = ratingCount > 0 && averageRating !== null
    ? `${averageRating.toFixed(1)} out of 5 (${ratingCount} rating${ratingCount === 1 ? "" : "s"})`
    : "Book has not been reviewed yet";

  return (
    <span className="inline-flex items-center gap-0.5" title={tooltip}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} className={star <= filled ? "text-amber-400" : "text-neutral-700"}>
          ★
        </span>
      ))}
    </span>
  );
}
