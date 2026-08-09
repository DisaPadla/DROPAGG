"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Check, ChevronDown } from "lucide-react";
import { DEMO_USERS } from "@/lib/demo-users";

interface UserSwitcherProps {
  currentUser: {
    id: string;
    name: string;
    email: string;
  };
}

export function UserSwitcher({ currentUser }: UserSwitcherProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSwitchUser = async (email: string, name: string) => {
    if (email === currentUser.email) {
      setIsOpen(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/switch-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, name }),
      });

      if (res.ok) {
        setIsOpen(false);
        router.refresh();
      }
    } catch (e) {
      console.error("Failed to switch user", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-muted/30 hover:bg-muted text-xs font-semibold transition-colors"
      >
        <div className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-[10px]">
          {currentUser.name[0]?.toUpperCase() || "U"}
        </div>
        <span className="max-w-[120px] truncate">{currentUser.name}</span>
        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-popover p-1.5 shadow-lg z-50 text-xs">
          <div className="px-2 py-1.5 font-bold text-muted-foreground uppercase text-[10px] tracking-wider border-b mb-1">
            Active Workspace User
          </div>

          <div className="space-y-0.5">
            {DEMO_USERS.map((u) => {
              const isActive = u.email === currentUser.email;
              return (
                <button
                  key={u.email}
                  type="button"
                  onClick={() => handleSwitchUser(u.email, u.name)}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors ${
                    isActive
                      ? "bg-primary/10 text-primary font-bold"
                      : "hover:bg-muted text-popover-foreground"
                  }`}
                >
                  <div className="flex flex-col">
                    <span>{u.name}</span>
                    <span className="text-[10px] text-muted-foreground font-mono">{u.email}</span>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
