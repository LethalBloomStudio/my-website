import Image from "next/image";
import BookClubParticipantAvatars from "@/components/BookClubParticipantAvatars";
import BookClubRatingPrompt from "@/components/BookClubRatingPrompt";
import BookClubStarRating from "@/components/BookClubStarRating";

type Participant = { user_id: string; username: string | null; pen_name: string | null; avatar_url: string | null };

// A closed month's only remaining trace on the main page -- summary only,
// deliberately not a link into the detail view (that's permanently
// inaccessible once a cycle completes, per the closing-mechanics RLS lockout).
export default function BookClubClosedMonthCard({
  bookTitle,
  bookAuthor,
  coverImageUrl,
  hostName,
  participants,
  stats,
  ratingCount,
  averageRating,
  cycleId,
  needsRating,
}: {
  bookTitle: string | null;
  bookAuthor: string | null;
  coverImageUrl: string | null;
  hostName: string | null;
  participants: Participant[];
  stats: { participantCount: number; fullSweepCount: number } | null;
  ratingCount: number;
  averageRating: number | null;
  cycleId: string;
  needsRating: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          {coverImageUrl && bookTitle && (
            <Image src={coverImageUrl} alt={bookTitle} width={44} height={62} className="h-[62px] w-11 shrink-0 rounded object-cover" />
          )}
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-neutral-600">Closed</p>
            {bookTitle ? (
              <>
                <p className="mt-1 text-sm font-medium text-neutral-200">{bookTitle}</p>
                {bookAuthor && <p className="text-xs text-neutral-500">by {bookAuthor}</p>}
              </>
            ) : (
              <p className="mt-1 text-sm text-neutral-500">No book was decided this month.</p>
            )}
            {hostName && <p className="mt-1 text-xs text-neutral-500">Hosted by {hostName}</p>}
          </div>
        </div>
        <div className="shrink-0 text-right space-y-1">
          {stats && <p className="text-xs text-neutral-500">{stats.participantCount} member{stats.participantCount === 1 ? "" : "s"}</p>}
          <BookClubStarRating ratingCount={ratingCount} averageRating={averageRating} />
        </div>
      </div>

      {participants.length > 0 && (
        <div className="mt-3">
          <BookClubParticipantAvatars participants={participants} />
        </div>
      )}

      {stats && stats.participantCount > 0 && (
        <p className="mt-2 text-[11px] text-neutral-600">
          {stats.fullSweepCount} of {stats.participantCount} finished every week
        </p>
      )}

      {needsRating && (
        <div className="mt-3 border-t border-neutral-800 pt-3">
          <BookClubRatingPrompt cycleId={cycleId} />
        </div>
      )}
    </div>
  );
}
