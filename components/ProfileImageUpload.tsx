"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export default function ProfileImageUpload({
  initialUrl,
  name = "avatar_url",
  bucket = "avatars",
  uploadButtonLabel = "Upload picture",
  previewAlt = "Image preview",
  onUploadedUrl,
  onUploadingChange,
  autoSave = false,
}: {
  initialUrl?: string | null;
  name?: string;
  bucket?: string;
  uploadButtonLabel?: string;
  previewAlt?: string;
  onUploadedUrl?: (url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  autoSave?: boolean;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [previewUrl, setPreviewUrl] = useState(initialUrl ?? "");
  const [uploadedUrl, setUploadedUrl] = useState(initialUrl ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setUploadingState(next: boolean) {
    setUploading(next);
    if (onUploadingChange) onUploadingChange(next);
  }

  async function removeImage() {
    setMsg(null);
    setPreviewUrl("");
    setUploadedUrl("");
    setFile(null);
    if (onUploadedUrl) onUploadedUrl("");
    if (autoSave) {
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user?.id) {
        await supabase.from("public_profiles").update({ avatar_url: null }).eq("user_id", auth.user.id);
        setMsg("Profile picture removed.");
      }
    }
  }

  async function uploadFile(fileOverride?: File | null) {
    const targetFile = fileOverride !== undefined ? fileOverride : file;
    if (!targetFile) return;
    if (targetFile.size > MAX_UPLOAD_BYTES) {
      setMsg("Image is too large. Please choose a file under 5MB.");
      return;
    }
    setUploadingState(true);
    setMsg(null);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setUploadingState(false);
      setMsg("Please sign in to upload.");
      return;
    }

    const ext = targetFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(path, targetFile, { upsert: true, contentType: targetFile.type || "image/jpeg" });

    if (uploadErr) {
      // Leave the existing picture in place rather than silently replacing it
      // with an unreliable inline copy - a failed upload should look and feel
      // like a failure, not a quiet, broken success.
      setUploadingState(false);
      setPreviewUrl(uploadedUrl);
      setMsg("Upload failed: " + uploadErr.message);
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const url = data.publicUrl;
    setUploadedUrl(url);
    setPreviewUrl(url);
    if (onUploadedUrl) onUploadedUrl(url);

    if (autoSave) {
      const { error: saveErr } = await supabase
        .from("public_profiles")
        .update({ avatar_url: url })
        .eq("user_id", auth.user?.id ?? "");
      if (saveErr) {
        setUploadingState(false);
        setMsg("Uploaded but failed to save: " + saveErr.message);
        return;
      }
      setMsg("Profile picture saved.");
    } else {
      setMsg("Uploaded.");
    }

    setUploadingState(false);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name={name} value={uploadedUrl} />

      <div className="flex items-center gap-4">
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt={previewAlt}
            width={64}
            height={64}
           
            className="h-16 w-16 rounded-full border border-neutral-700 object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/40 text-xs text-neutral-400">
            No image
          </div>
        )}
        <div className="text-xs text-neutral-400">
          Upload from your computer.
        </div>
      </div>

      <input
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => {
          const nextFile = e.target.files?.[0] ?? null;
          setFile(nextFile);
          if (nextFile) {
            setPreviewUrl(URL.createObjectURL(nextFile));
            // Collapse pick + save into one step for autoSave consumers - the
            // button below still works as a manual retry after a failure.
            if (autoSave) void uploadFile(nextFile);
          }
        }}
        className="block w-full text-sm"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void uploadFile()}
          disabled={!file || uploading}
          className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm disabled:opacity-60"
        >
          {uploading ? "Uploading..." : uploadButtonLabel}
        </button>
        {previewUrl && (
          <button
            type="button"
            onClick={removeImage}
            disabled={uploading}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-red-800/50 bg-red-950/30 px-4 text-sm text-red-400 hover:bg-red-950/50 disabled:opacity-60 transition"
          >
            Remove picture
          </button>
        )}
      </div>

      {msg ? <p className="text-xs text-neutral-300">{msg}</p> : null}
    </div>
  );
}
