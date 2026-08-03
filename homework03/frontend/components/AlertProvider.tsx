"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import AlertDialog from "./AlertDialog";

type AlertType = "success" | "error" | "warning" | "info";

interface AlertContextType {
  showSuccess: (msg: string, title?: string) => void;
  showError: (msg: string, title?: string) => void;
  showWarning: (msg: string, title?: string) => void;
  showInfo: (msg: string, title?: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export function AlertProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<AlertType>("info");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");

  const show = useCallback((t: AlertType, msg: string, title?: string) => {
    setType(t);
    setMessage(msg);
    setTitle(title || "");
    setOpen(true);
  }, []);

  const value: AlertContextType = {
    showSuccess: (msg, title) => show("success", msg, title),
    showError: (msg, title) => show("error", msg, title),
    showWarning: (msg, title) => show("warning", msg, title),
    showInfo: (msg, title) => show("info", msg, title),
  };

  return (
    <AlertContext.Provider value={value}>
      {children}
      <AlertDialog
        open={open}
        type={type}
        title={title}
        message={message}
        onClose={() => setOpen(false)}
      />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const context = useContext(AlertContext);
  if (context === undefined) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
}
