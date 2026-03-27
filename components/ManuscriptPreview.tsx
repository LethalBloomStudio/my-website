import type { SceneNode } from "@/lib/format/normalizeManuscript";

type Props = {
  nodes: SceneNode[];
  emptyMessage?: string;
  className?: string;
  isOwner?: boolean;
  onBlockedCopy?: () => void;
};

/**
 * Renders manuscript preview with semantic paragraph + scene break blocks.
 * Text is assumed to be pre-normalized; we do not mutate content here.
 */
export function ManuscriptPreview({ nodes, emptyMessage, className, isOwner, onBlockedCopy }: Props) {
  return (
    <div
      className={`max-h-[520px] overflow-auto rounded-lg border border-[rgba(120,120,120,0.25)] bg-[rgba(18,18,18,0.85)] px-5 py-5 font-['Merriweather','Georgia','Times_New_Roman',serif] text-[16px] leading-[1.85] text-[#eae6ff] ${className ?? ""}`}
    >
      {nodes.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyMessage ?? "Start typing to see your formatted preview."}</p>
      ) : (
        nodes.map((node, idx) =>
          node.type === "scene-break" ? (
            <div
              key={`scene-${idx}`}
              className="my-4 flex items-center justify-center text-sm tracking-[0.3em] text-[rgba(210,210,210,0.75)]"
              onCopy={(e) => {
                if (isOwner === false) {
                  e.preventDefault();
                  onBlockedCopy?.();
                }
              }}
            >
              {node.marker || "***"}
            </div>
          ) : (
            <p
              key={`p-${idx}`}
              className="whitespace-pre-line [text-indent:1.5rem]"
              onCopy={(e) => {
                if (isOwner === false) {
                  e.preventDefault();
                  onBlockedCopy?.();
                }
              }}
            >
              {node.text}
            </p>
          ),
        )
      )}
    </div>
  );
}

export default ManuscriptPreview;
