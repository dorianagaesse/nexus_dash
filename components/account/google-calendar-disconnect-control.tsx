"use client";

import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";

interface DisconnectResponse {
  settings?: {
    revocationStatus?: "revoked" | "not-connected" | "unconfirmed";
  };
  error?: string;
}

export function GoogleCalendarDisconnectControl() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disconnect = async () => {
    setIsDisconnecting(true);
    setError(null);

    try {
      const response = await fetch("/api/account/settings/google-calendar", {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => null)) as
        | DisconnectResponse
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "disconnect-failed");
      }

      const target = new URL(window.location.href);
      target.searchParams.delete("error");
      target.searchParams.set(
        "status",
        payload?.settings?.revocationStatus === "unconfirmed"
          ? "calendar-disconnected-revocation-warning"
          : "calendar-disconnected"
      );
      setIsOpen(false);
      router.replace(`${target.pathname}${target.search}`);
      router.refresh();
    } catch {
      setError(
        "Could not finish disconnecting Google Calendar. Retry, and review NexusDash access in your Google Account permissions if the problem continues."
      );
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="destructive"
        className="min-h-11 w-full sm:w-auto"
        onClick={() => setIsOpen(true)}
      >
        <Unplug className="h-4 w-4" />
        Disconnect Google Calendar
      </Button>
      {error ? (
        <p role="alert" className="max-w-2xl text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        isOpen={isOpen}
        title="Disconnect Google Calendar?"
        description="NexusDash will stop using this Google account and permanently remove its stored tokens. Existing events in Google Calendar will not be deleted."
        confirmLabel="Disconnect"
        confirmingLabel="Disconnecting..."
        isConfirming={isDisconnecting}
        onConfirm={disconnect}
        onCancel={() => setIsOpen(false)}
      />
    </div>
  );
}
