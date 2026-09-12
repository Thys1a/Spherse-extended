import { useEffect, useState } from "react";
import { useI18n } from "@spherse/i18n/react";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Textarea } from "../../components/ui/textarea";
import type { ApiClient } from "../../lib/api";
import type { CommandDefinition } from "../../lib/types";

interface CommandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ApiClient;
  command: CommandDefinition | null;
  onSaved: () => void;
}

export function CommandDialog({ open, onOpenChange, client, command, onSaved }: CommandDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("");
  const [template, setTemplate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(command?.name ?? "");
      setDescription(command?.description ?? "");
      setModel(command?.model ?? "");
      setTemplate(command?.template ?? "");
      setSubmitting(false);
    }
  }, [open, command]);

  const trimmedName = name.trim();
  const canSubmit = (command !== null || trimmedName !== "") && template.trim() !== "" && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (command) {
        await client.updateCommand(command.name, {
          description,
          model,
          template,
        });
        toast.success(t("command-panel.update.success", { name: command.name }));
      } else {
        await client.createCommand({
          name: trimmedName,
          description: description.trim() || undefined,
          model: model.trim() || undefined,
          template,
        });
        toast.success(t("command-panel.create.success", { name: trimmedName }));
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      const message = (err as Error).message ?? "";
      if (message.toLowerCase().includes("already exists")) {
        toast.error(t("command-panel.create.exists", { name: trimmedName }));
      } else {
        toast.error(t("command-panel.save.failed", { message }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {command ? t("command-panel.editDialog.title") : t("command-panel.createDialog.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {!command && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="command-name">{t("command-panel.createDialog.nameLabel")}</Label>
              <Input
                id="command-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="test"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="command-description">{t("command-panel.createDialog.descriptionLabel")}</Label>
            <Input
              id="command-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="command-model">{t("command-panel.createDialog.modelLabel")}</Label>
            <Input
              id="command-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="openai/gpt-4o"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="command-template">{t("command-panel.createDialog.templateLabel")}</Label>
            <Textarea
              id="command-template"
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={6}
              placeholder={t("command-panel.createDialog.templatePlaceholder")}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("command-panel.createDialog.cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {command ? t("command-panel.editDialog.submit") : t("command-panel.createDialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
