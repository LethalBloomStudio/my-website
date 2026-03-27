"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/Supabase/browser";

export default function ProfileImageUpload({
  initialUrl,
  name = "avatar_url",
  bucket = "avatars",
  uploadButtonLabel = "Upload picture",
  previewAlt = "Image preview",
  onUploadedUrl,
  autoSave = false,
}: {
  initialUrl?: string | null;
  name?: string;
  bucket?: string;
  uploadButtonLabel?: string;
  previewAlt?: string;
  onUploadedUrl?: (url: string) => void;
  autoSave?: boolean;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [previewUrl, setPreviewUrl] = useState(initialUrl ?? "");
  const [uploadedUrl, setUploadedUrl] = useState(initialUrl ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function readFileAsDataUrl(nextFile: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(nextFile);
    });
  }

  async function uploadFile() {
    if (!file) return;
    setUploading(true);
    setMsg(null);

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) {
      setUploading(false);
      setMsg("Please sign in to upload.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${safeExt}`;

    const { error: uploadErr } = await supabase.storage
      .from(bucket)
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });

    if (uploadErr) {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        setUploadedUrl(dataUrl);
        setPreviewUrl(dataUrl);
        if (onUploadedUrl) onUploadedUrl(dataUrl);
        if (autoSave) {
          await supabase
            .from("public_profiles")
            .update({ avatar_url: dataUrl })
            .eq("user_id", userId);
        }
        setUploading(false);
        setMsg("Uploaded locally (storage policy blocked file bucket upload).");
        return;
      } catch {
        // fall through to original storage error
      }
      setUploading(false);
      setMsg(uploadErr.message);
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
        setUploading(false);
        setMsg("Uploaded but failed to save: " + saveErr.message);
        return;
      }
      setMsg("Profile picture saved.");
    } else {
      setMsg("Uploaded.");
    }

    setUploading(false);
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
            unoptimized
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
          if (nextFile) setPreviewUrl(URL.createObjectURL(nextFile));
        }}
        className="block w-full text-sm"
      />

      <button
        type="button"
        onClick={uploadFile}
        disabled={!file || uploading}
        className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm disabled:opacity-60"
      >
        {uploading ? "Uploading..." : uploadButtonLabel}
      </button>

      {msg ? <p className="text-xs text-neutral-300">{msg}</p> : null}
    </div>
  );
}
