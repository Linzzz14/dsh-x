/**
 * The destructive-confirmation modal, matching the native workspace delete
 * pattern: Cancel plus a red-outline action that only keeps the error color
 * while it is enabled.
 */
import * as React from "react";
import * as P from "@deepseek-ai/dsh-client-ui-primitives";

const h = React.createElement;

// Same tokens and metrics as ui-workspace's deleteStatus / renameError.
export const pendingStyle = { color: "var(--dsw-alias-label-secondary)", fontSize: 12, lineHeight: "18px" };
export const errorStyle = { color: "var(--dsw-alias-state-error-primary)", marginTop: 8, fontSize: 12, lineHeight: "18px" };

export function ConfirmDialog({
  title,
  description,
  closeLabel,
  cancelLabel,
  confirmLabel,
  busy,
  blocked,
  onClose,
  onConfirm,
  children
}) {
  return h(P.Modal, {
    open: true,
    onClose,
    closeLabel,
    title,
    description,
    footer: h(React.Fragment, null,
      h(P.Button, { variant: "outline", disabled: busy, onClick: onClose }, cancelLabel),
      h(P.Button, {
        variant: "outline",
        disabled: busy || blocked,
        onClick: onConfirm,
        style: busy || blocked ? undefined : { color: "var(--dsw-alias-state-error-primary)" }
      }, confirmLabel)
    )
  }, children);
}
