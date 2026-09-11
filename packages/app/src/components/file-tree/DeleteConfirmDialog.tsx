import { useI18n } from "@spherse/i18n/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "../../components/ui/alert-dialog";
import type { DeleteTarget } from "./tree-model";

export function DeleteConfirmDialog({
  targets,
  onConfirm,
  onCancel,
}: {
  targets: DeleteTarget[] | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const single = targets !== null && targets.length === 1 ? targets[0] : null;
  return (
    <AlertDialog
      open={targets !== null && targets.length > 0}
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <AlertDialogContent>
        <AlertDialogTitle>{t("file-tree.confirmDeleteTitle")}</AlertDialogTitle>
        <AlertDialogDescription>
          {single
            ? single.type === "directory"
              ? t("file-tree.confirmDeleteDir", { name: single.name })
              : t("file-tree.confirmDeleteFile", { name: single.name })
            : targets && t("file-tree.confirmDeleteMany", { count: targets.length })}
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
