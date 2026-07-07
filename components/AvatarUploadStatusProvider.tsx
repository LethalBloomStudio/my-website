"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import ProfileImageUpload from "./ProfileImageUpload";

type AvatarUploadStatus = {
  uploading: boolean;
  setUploading: (uploading: boolean) => void;
};

const AvatarUploadStatusContext = createContext<AvatarUploadStatus>({
  uploading: false,
  setUploading: () => {},
});

export default function AvatarUploadStatusProvider({ children }: { children: ReactNode }) {
  const [uploading, setUploading] = useState(false);
  return (
    <AvatarUploadStatusContext.Provider value={{ uploading, setUploading }}>
      {children}
    </AvatarUploadStatusContext.Provider>
  );
}

// Wraps the avatar ProfileImageUpload so its in-flight upload state can gate
// the page's Save changes button, without coupling the shared, reusable
// ProfileImageUpload component itself to this page's context.
export function AvatarUploadField({ initialUrl }: { initialUrl: string }) {
  const { setUploading } = useContext(AvatarUploadStatusContext);
  return <ProfileImageUpload initialUrl={initialUrl} name="avatar_url" autoSave onUploadingChange={setUploading} />;
}

export function SaveChangesButton() {
  const { uploading } = useContext(AvatarUploadStatusContext);
  return (
    <button
      disabled={uploading}
      className="inline-flex h-12 items-center justify-center rounded-lg bg-neutral-100 px-6 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200 disabled:opacity-60"
    >
      {uploading ? "Uploading picture…" : "Save changes"}
    </button>
  );
}
