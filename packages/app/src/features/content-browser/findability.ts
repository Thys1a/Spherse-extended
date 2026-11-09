export interface FindableInput {
  loading: boolean;
  error: string | null;
  binary: boolean;
  isImage: boolean;
  isHtml: boolean;
  htmlView: "preview" | "source";
  isEditing: boolean;
}

export function isFindable(i: FindableInput): boolean {
  if (i.loading || i.error || i.binary || i.isImage) return false;
  if (i.isEditing) return true;
  return !(i.isHtml && i.htmlView === "preview");
}
