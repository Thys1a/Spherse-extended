import { useEffect, useRef } from "react";
import { Input } from "../../components/ui/input";
import { INVALID_NAME_RE } from "./tree-model";

export function InlineNameInput({
  depth,
  initialValue,
  onSubmit,
  onCancel,
}: {
  depth: number;
  initialValue?: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (initialValue !== undefined) inputRef.current?.select();
  }, [initialValue]);

  return (
    <div style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
      <Input
        ref={inputRef}
        defaultValue={initialValue}
        className="h-6 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const value = e.currentTarget.value.trim();
            if (value && !INVALID_NAME_RE.test(value)) {
              onSubmit(value);
            }
          }
          if (e.key === "Escape") {
            onCancel();
          }
        }}
        onBlur={() => onCancel()}
      />
    </div>
  );
}
