import React from "react";

interface LoginButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export function LoginButton({ children = "Sign In", ...props }: LoginButtonProps) {
  const handleLogin = () => {
    const base = (import.meta as unknown as { env?: { BASE_URL?: string } })?.env?.BASE_URL?.replace(/\/+$/, "") ?? "/";
    window.location.href = `/api/login?returnTo=${encodeURIComponent(base)}`;
  };

  return (
    <button onClick={handleLogin} {...props}>
      {children}
    </button>
  );
}

interface LogoutButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export function LogoutButton({ children = "Sign Out", ...props }: LogoutButtonProps) {
  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  return (
    <button onClick={handleLogout} {...props}>
      {children}
    </button>
  );
}
