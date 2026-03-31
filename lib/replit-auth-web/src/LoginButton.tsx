import React from "react";

interface LoginButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
}

export function LoginButton({ children = "Sign In", ...props }: LoginButtonProps) {
  const handleLogin = () => {
    window.location.href = "/login";
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
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = "/";
  };

  return (
    <button onClick={handleLogout} {...props}>
      {children}
    </button>
  );
}
