import Image from "next/image";
import Link from "next/link";

type Participant = {
  user_id: string;
  username: string | null;
  pen_name: string | null;
  avatar_url: string | null;
};

// Same visual pattern as "Accepted readers" in
// app/manuscripts/[id]/details/page.tsx (circular avatar, fallback
// initial, name underneath, horizontal scroll) -- stripped of the
// manuscript-specific bits (reward/disable hover menu, add-slot button,
// online-presence ring) since this is a read-only "who's here" list.
export default function BookClubParticipantAvatars({ participants }: { participants: Participant[] }) {
  if (participants.length === 0) {
    return <p className="text-xs text-neutral-500">No one has opted in yet.</p>;
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {participants.map((p) => {
        const name = p.pen_name || p.username || "Member";
        return (
          <div key={p.user_id} className="flex shrink-0 flex-col items-center gap-1.5">
            <div className="h-12 w-12 overflow-hidden rounded-full border-2 border-[rgba(120,120,120,0.5)] bg-neutral-900">
              {p.avatar_url ? (
                <Image src={p.avatar_url} alt={name} width={48} height={48} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-sm font-semibold text-[rgba(210,210,210,0.8)]">
                  {name[0].toUpperCase()}
                </span>
              )}
            </div>
            {p.username ? (
              <Link href={`/u/${p.username}`} className="max-w-[56px] truncate text-center text-[10px] text-neutral-300 hover:text-white transition">
                {name}
              </Link>
            ) : (
              <span className="max-w-[56px] truncate text-center text-[10px] text-neutral-300">{name}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
